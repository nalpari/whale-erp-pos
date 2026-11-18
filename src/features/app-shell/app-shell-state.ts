// 프로그램 틀의 화면 상태. 라이브러리 없이 useReducer로 관리한다 (스펙 11장 D).
import type { Session } from "../../shared/api/auth";
import type { MainTabId, SettingsTabId } from "./tabs";

export type DialogKind = "stop-orders" | "restart" | "logout" | "exit";

export interface AppShellState {
  session: Session | null;
  /** 시작 시 자동 로그인을 확인하는 중인지. 이 동안 로그인 폼 대신 빈 화면을 보인다 (스펙 4장). */
  restoring: boolean;
  activeTab: MainTabId;
  settingsTab: SettingsTabId;
  /** 서버가 성공을 돌려준 주문 받기 상태. 요청 중에는 바뀌지 않는다. */
  accepting: boolean;
  togglePending: boolean;
  toggleError: boolean;
  dialog: DialogKind | null;
  /** 로그아웃 · 다시시작 · 프로그램 종료 팝업에서 확인을 누른 뒤 처리 중인지. */
  dialogPending: boolean;
  /** "로그 확인" 화면이 탭 · 로그인 화면 대신 보이는 중인지 (개발자 추가 기능, SPEC-logging 3.1). */
  logViewerOpen: boolean;
}

export type AppShellAction =
  | { type: "login"; session: Session }
  | { type: "restore-finished"; session: Session | null }
  | { type: "logout" }
  /** 프로그램 종료 처리 중의 로그아웃. 종료가 끝날 때까지 팝업(처리 중)을 그대로 둔다. */
  | { type: "logout-for-shutdown" }
  /** 보낸 "주문 중단" 요청에 맞춰 화면 토글도 OFF로 내린다. 다시시작이 실패해도 서버(OFF)와 표시가 맞게. 요청이 실패했으면 서버와 다를 수 있고, 그때는 점원이 다시 켜서 맞춘다. */
  | { type: "orders-stopped" }
  | { type: "select-tab"; tab: MainTabId }
  | { type: "select-settings-tab"; tab: SettingsTabId }
  | { type: "toggle-request" }
  | { type: "toggle-success"; accepting: boolean }
  | { type: "toggle-failure" }
  | { type: "dismiss-toggle-error" }
  | { type: "open-dialog"; dialog: DialogKind }
  | { type: "close-dialog" }
  | { type: "dialog-confirmed" }
  | { type: "dialog-finished" }
  | { type: "open-log-viewer" }
  | { type: "close-log-viewer" };

// 로그인할 때마다 이 값으로 되돌린다. 주문받기는 매번 OFF로 시작한다 (스펙 2.2-1, Q03).
const SIGNED_IN_DEFAULTS = {
  activeTab: "order-board",
  settingsTab: "widget",
  accepting: false,
  togglePending: false,
  toggleError: false,
} as const satisfies Partial<AppShellState>;

export function createInitialState(session: Session | null): AppShellState {
  return {
    session,
    restoring: false,
    ...SIGNED_IN_DEFAULTS,
    dialog: null,
    dialogPending: false,
    logViewerOpen: false,
  };
}

export function appShellReducer(
  state: AppShellState,
  action: AppShellAction,
): AppShellState {
  switch (action.type) {
    case "open-log-viewer":
      return { ...state, logViewerOpen: true };
    case "close-log-viewer":
      return { ...state, logViewerOpen: false };
    case "login":
      // 로그 화면을 열어 둔 채 로그인이 끝나도 점원이 [닫기]를 누르기 전에는 닫지 않는다.
      return {
        ...createInitialState(action.session),
        logViewerOpen: state.logViewerOpen,
      };
    case "restore-finished":
      // 확인 중이 아니면(이미 끝난 뒤) 늦은 결과는 버린다.
      if (!state.restoring) return state;
      if (!action.session) return { ...state, restoring: false };
      // 열려 있던 팝업(예: 확인 중 Alt+F4)은 그대로 둔다.
      return {
        ...createInitialState(action.session),
        logViewerOpen: state.logViewerOpen,
        dialog: state.dialog,
        dialogPending: state.dialogPending,
      };
    case "logout":
      return createInitialState(null);
    case "logout-for-shutdown":
      // 종료가 끝날 때까지 팝업(처리 중)을 남겨 둔다. dialogPending 때문에 그 사이 Alt+F4가
      // 새 팝업을 열지 못하고(open-dialog 무시), 점원도 처리 중임을 본다. 뒤 화면은 로그인 화면으로 바뀐다.
      return {
        ...createInitialState(null),
        dialog: state.dialog,
        dialogPending: state.dialogPending,
      };
    case "orders-stopped":
      return { ...state, accepting: false };
    case "select-tab":
      return { ...state, activeTab: action.tab };
    case "select-settings-tab":
      return { ...state, settingsTab: action.tab };
    case "toggle-request":
      return { ...state, togglePending: true, toggleError: false };
    // 방어 코드: 요청 중이 아닐 때(로그인 · 로그아웃으로 상태가 초기화된 뒤) 늦게 온 결과는 버린다.
    // 지금은 Provider가 토글 요청이 끝난 뒤에 로그아웃하므로 생기지 않지만, 다음 로그인은 반드시 OFF로 시작해야 한다.
    case "toggle-success":
      if (!state.togglePending) return state;
      return { ...state, togglePending: false, accepting: action.accepting };
    case "toggle-failure":
      if (!state.togglePending) return state;
      return { ...state, togglePending: false, toggleError: true };
    case "dismiss-toggle-error":
      return { ...state, toggleError: false };
    case "open-dialog":
      // 처리 중인 팝업이 있으면 다른 팝업으로 바꾸지 않는다 (예: 종료 처리 중 Alt+F4).
      if (state.dialogPending) return state;
      return { ...state, dialog: action.dialog };
    case "close-dialog":
      if (state.dialogPending) return state;
      return { ...state, dialog: null };
    case "dialog-confirmed":
      return { ...state, dialogPending: true };
    case "dialog-finished":
      return { ...state, dialog: null, dialogPending: false };
  }
}
