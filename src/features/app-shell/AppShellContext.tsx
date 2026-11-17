// 프로그램 틀의 상태와 동작을 화면에 내려 준다. 서버 · 창 호출은 모두 여기서 한다.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { AuthApi, Session } from "../../shared/api/auth";
import type { StoreStatusApi } from "../../shared/api/store-status";
import type {
  PrinterApi,
  PrinterSettingsStore,
} from "../../shared/printer/printer-api";
import { errorSummary } from "../../shared/error-summary";
import type { TokenStore } from "../../shared/session/token-store";
import type { AppWindow } from "../../shared/platform/window";
import {
  appShellReducer,
  createInitialState,
  type AppShellState,
  type DialogKind,
} from "./app-shell-state";
import type { MainTabId, SettingsTabId } from "./tabs";

interface AppShellActions {
  /**
   * remember: 자동로그인 체크 여부. 참이고 점포번호 계정이며 재발급 토큰이 있으면 저장하고,
   * 그 밖에는 남은 토큰을 지운다 (스펙 4장).
   */
  login(session: Session, remember: boolean): void;
  selectTab(tab: MainTabId): void;
  selectSettingsTab(tab: SettingsTabId): void;
  /** 토글을 눌렀을 때. ON으로는 바로 요청하고, OFF로는 확인 팝업을 연다 (스펙 2.2). */
  requestAccepting(next: boolean): void;
  dismissToggleError(): void;
  openDialog(dialog: DialogKind): void;
  closeDialog(): void;
  /** 열린 확인 팝업에서 확인 버튼을 눌렀을 때. */
  confirmDialog(): void;
  minimizeWindow(): void;
  restoreWindow(): void;
  maximizeWindow(): void;
}

interface AppShellContextValue {
  state: AppShellState;
  actions: AppShellActions;
  /** 로그인 화면이 쓰는 로그인 API. */
  authApi: AuthApi;
  /** 프린터설정 화면이 쓰는 프린터 목록 · 시험 인쇄. */
  printerApi: PrinterApi;
  /** 프린터설정 화면이 쓰는 설정 저장소. */
  printerSettingsStore: PrinterSettingsStore;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

interface Props {
  windowApi: AppWindow;
  storeStatusApi: StoreStatusApi;
  authApi: AuthApi;
  tokenStore: TokenStore;
  printerApi: PrinterApi;
  printerSettingsStore: PrinterSettingsStore;
  initialSession: Session | null;
  /** 있으면 시작할 때 불러 자동 로그인을 확인한다. 끝날 때까지 로그인 폼 대신 빈 화면을 보인다. */
  restoreSession?: () => Promise<Session | null>;
  children: ReactNode;
}

function logTokenError(action: string) {
  return (error: unknown) => {
    // 토큰 저장소 오류는 로그인 · 로그아웃을 막지 않는다. 토큰 값은 남기지 않는다.
    console.error(`[auto-login] 토큰 ${action} 실패`, errorSummary(error));
  };
}

function logWindowError(action: string) {
  return (error: unknown) => {
    // 창 권한 누락 등은 점원이 고칠 수 없으므로 화면에 띄우지 않고 기록만 남긴다.
    console.error(`[window] ${action} 실패`, error);
  };
}

export function AppShellProvider({
  windowApi,
  storeStatusApi,
  authApi,
  tokenStore,
  printerApi,
  printerSettingsStore,
  initialSession,
  restoreSession,
  children,
}: Props) {
  const [state, dispatch] = useReducer(appShellReducer, null, () => ({
    ...createInitialState(initialSession),
    // 이미 세션을 받았으면 확인할 것이 없다.
    restoring: restoreSession !== undefined && initialSession === null,
  }));

  // 시작할 때 한 번만 확인한다. restoreSession은 거절하지 않지만, 혹시 거절해도 빈 화면에 갇히지 않게 null로 끝낸다.
  // 개발 모드 StrictMode는 effect를 두 번 돌리므로 요청을 ref에 두고 같이 쓴다. 두 번 보내면 토큰을 매번 바꾸는
  // 서버에서는 두 번째 요청이 폐기된 토큰으로 실패해 토큰이 지워진다.
  // 이미 세션을 받았으면 확인하지 않는다 (위 restoring 초기값과 같은 조건).
  const restoreRef = useRef(
    initialSession === null ? restoreSession : undefined,
  );
  const restorePromiseRef = useRef<Promise<Session | null> | null>(null);
  useEffect(() => {
    const restore = restoreRef.current;
    if (!restore) return;
    let disposed = false;
    restorePromiseRef.current ??= restore().catch((error: unknown) => {
      // restoreSession은 거절하지 않는다. 여기 오면 버그이므로 기록한다.
      console.error(
        "[auto-login] 시작 확인이 예기치 않게 거절됨",
        errorSummary(error),
      );
      return null;
    });
    restorePromiseRef.current.then((session) => {
      if (!disposed) dispatch({ type: "restore-finished", session });
    });
    return () => {
      disposed = true;
    };
  }, []);

  // 비동기 처리 중에 최신 상태를 읽기 위해 둔다. 렌더 뒤에만 갱신한다.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // 진행 중인 토글 요청. 렌더를 기다리지 않고 바로 두 번 보내기를 막고,
  // 로그아웃 · 종료가 이 요청이 끝난 뒤에 "주문 중단"을 보내게 하려고 둔다.
  const toggleInFlightRef = useRef<Promise<void> | null>(null);

  const sendAccepting = useCallback(
    (accepting: boolean) => {
      if (toggleInFlightRef.current) return;
      dispatch({ type: "toggle-request" });
      const request = (async () => {
        try {
          await storeStatusApi.setAcceptingOrders(accepting);
          dispatch({ type: "toggle-success", accepting });
        } catch (error) {
          console.error(
            "[store-status] 주문 받기 상태 변경 실패",
            { accepting },
            error,
          );
          dispatch({ type: "toggle-failure" });
        } finally {
          toggleInFlightRef.current = null;
        }
      })();
      toggleInFlightRef.current = request;
    },
    [storeStatusApi],
  );

  // 로그아웃 · 시스템종료 전에 주문 중단을 보낸다. 실패해도 진행한다 (스펙 2.3, 프로그램을 못 끄는 상황 방지).
  const stopOrdersBestEffort = useCallback(
    async (reason: "logout" | "shutdown") => {
      // "주문 받음" 요청이 아직 가는 중이면 그 뒤에 보낸다. 먼저 보내면 늦게 도착한
      // "주문 받음"이 서버에 남아, 로그아웃했는데도 고객 주문이 들어올 수 있다.
      // 진행 중인 요청이 없으면 기다리지 않고 바로 보낸다 (`await null`도 한 박자 늦춘다).
      const inFlight = toggleInFlightRef.current;
      if (inFlight) await inFlight;
      try {
        await storeStatusApi.setAcceptingOrders(false);
      } catch (error) {
        console.error(
          "[store-status] 로그아웃 · 종료 전 주문 중단 실패, 그대로 진행",
          { reason },
          error,
        );
      }
    },
    [storeStatusApi],
  );

  const confirmDialog = useCallback(() => {
    const current = stateRef.current;
    if (current.dialogPending) return;
    switch (current.dialog) {
      case null:
        return;
      case "stop-orders":
        dispatch({ type: "close-dialog" });
        sendAccepting(false);
        return;
      case "logout":
        dispatch({ type: "dialog-confirmed" });
        // stopOrdersBestEffort는 거절하지 않지만, 어떤 예외가 나도 팝업이 처리 중으로 굳지 않게 finally로 로그아웃한다.
        void stopOrdersBestEffort("logout").finally(() => {
          dispatch({ type: "logout" });
          // 로그아웃하면 자동 로그인을 끈다 (스펙 3.4-3). 시스템종료는 지우지 않는다(다음 실행 때 자동 로그인).
          tokenStore.clear().catch(logTokenError("삭제"));
        });
        return;
      case "shutdown": {
        dispatch({ type: "dialog-confirmed" });
        const loggedIn = current.session !== null;
        void (async () => {
          if (loggedIn) {
            await stopOrdersBestEffort("shutdown");
            dispatch({ type: "logout-for-shutdown" });
          }
          try {
            await windowApi.exit();
          } catch (error) {
            // 종료가 실패하면 팝업이 처리 중으로 굳지 않게 닫아서 다시 시도할 수 있게 한다.
            logWindowError("종료")(error);
            dispatch({ type: "dialog-finished" });
          }
        })();
        return;
      }
    }
  }, [sendAccepting, stopOrdersBestEffort, windowApi, tokenStore]);

  const requestAccepting = useCallback(
    (next: boolean) => {
      // 팝업이 열려 있으면(특히 로그아웃 · 종료 처리 중) 토글 요청을 무시한다.
      // 화면은 inert로 막혀 있지만, 처리 중에 "주문 받음"이 나가면 안 되므로 여기서도 막는다.
      if (toggleInFlightRef.current || stateRef.current.dialog) return;
      if (next) {
        sendAccepting(true);
      } else {
        // 주문 중단은 고객 주문을 막으므로 반드시 확인을 받는다 (화면정의서 p.5)
        dispatch({ type: "open-dialog", dialog: "stop-orders" });
      }
    },
    [sendAccepting],
  );

  // 운영체제 닫기(Alt+F4 등)는 시스템종료와 같은 확인 팝업으로 돌린다 (스펙 2.4).
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    windowApi
      .onCloseRequested(() =>
        dispatch({ type: "open-dialog", dialog: "shutdown" }),
      )
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error: unknown) => {
        // 등록이 실패하면 Alt+F4가 확인 · 주문 중단 없이 창을 닫는다. 영향을 로그에 남긴다.
        console.error(
          "[window] 닫기 가로채기 등록 실패: Alt+F4 보호가 꺼짐",
          error,
        );
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [windowApi]);

  const actions = useMemo<AppShellActions>(
    () => ({
      login: (session, remember) => {
        dispatch({ type: "login", session });
        // 점포번호 계정만 자동 로그인을 쓴다. 휴대폰 번호는 저장하지 않고 재발급 토큰만 저장한다 (스펙 4장).
        if (
          remember &&
          session.accountType === "store" &&
          session.refreshToken
        ) {
          tokenStore.save(session.refreshToken).catch((error: unknown) => {
            logTokenError("저장")(error);
            // 이전 계정 토큰이 남아 다음 실행 때 다른 점포로 자동 로그인되지 않게 지운다.
            return tokenStore.clear().catch(logTokenError("삭제"));
          });
        } else {
          tokenStore.clear().catch(logTokenError("삭제"));
        }
      },
      selectTab: (tab) => dispatch({ type: "select-tab", tab }),
      selectSettingsTab: (tab) =>
        dispatch({ type: "select-settings-tab", tab }),
      requestAccepting,
      dismissToggleError: () => dispatch({ type: "dismiss-toggle-error" }),
      openDialog: (dialog) => dispatch({ type: "open-dialog", dialog }),
      closeDialog: () => dispatch({ type: "close-dialog" }),
      confirmDialog,
      minimizeWindow: () =>
        void windowApi.minimize().catch(logWindowError("최소화")),
      restoreWindow: () =>
        void windowApi.restoreDefaultSize().catch(logWindowError("줄이기")),
      maximizeWindow: () =>
        void windowApi.maximize().catch(logWindowError("늘리기")),
    }),
    [requestAccepting, confirmDialog, windowApi, tokenStore],
  );

  const value = useMemo(
    () => ({ state, actions, authApi, printerApi, printerSettingsStore }),
    [state, actions, authApi, printerApi, printerSettingsStore],
  );
  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Provider와 짝을 이루는 훅이라 같은 파일에 둔다
export function useAppShell(): AppShellContextValue {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error("useAppShell은 AppShellProvider 안에서만 쓸 수 있습니다.");
  }
  return value;
}
