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
import type { StoreStatusApi } from "../../shared/api/store-status";
import type { AppWindow } from "../../shared/platform/window";
import {
  appShellReducer,
  createInitialState,
  type AppShellState,
  type DialogKind,
  type Session,
} from "./app-shell-state";
import type { MainTabId, SettingsTabId } from "./tabs";

interface AppShellActions {
  login(session: Session): void;
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
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

interface Props {
  windowApi: AppWindow;
  storeStatusApi: StoreStatusApi;
  initialSession: Session | null;
  children: ReactNode;
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
  initialSession,
  children,
}: Props) {
  const [state, dispatch] = useReducer(
    appShellReducer,
    initialSession,
    createInitialState,
  );

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
        void stopOrdersBestEffort("logout").finally(() =>
          dispatch({ type: "logout" }),
        );
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
  }, [sendAccepting, stopOrdersBestEffort, windowApi]);

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
      login: (session) => dispatch({ type: "login", session }),
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
    [requestAccepting, confirmDialog, windowApi],
  );

  const value = useMemo(() => ({ state, actions }), [state, actions]);
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
