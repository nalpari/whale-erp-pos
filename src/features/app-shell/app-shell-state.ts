// 프로그램 틀의 화면 상태. 라이브러리 없이 useReducer로 관리한다 (스펙 11장 D).
import type { MainTabId, SettingsTabId } from "./tabs";

/** 로그인 상태. T02가 실제 로그인을 만들기 전까지 모의 값으로 채운다. */
export interface Session {
  storeName: string;
}

export type DialogKind = "stop-orders" | "logout" | "shutdown";

export interface AppShellState {
  session: Session | null;
  activeTab: MainTabId;
  settingsTab: SettingsTabId;
  /** 서버가 성공을 돌려준 주문 받기 상태. 요청 중에는 바뀌지 않는다. */
  accepting: boolean;
  togglePending: boolean;
  toggleError: boolean;
  dialog: DialogKind | null;
  /** 로그아웃 · 시스템종료 팝업에서 확인을 누른 뒤 처리 중인지. */
  dialogPending: boolean;
}

export type AppShellAction =
  | { type: "login"; session: Session }
  | { type: "logout" }
  /** 시스템종료 처리 중의 로그아웃. 종료가 끝날 때까지 팝업(처리 중)을 그대로 둔다. */
  | { type: "logout-for-shutdown" }
  | { type: "select-tab"; tab: MainTabId }
  | { type: "select-settings-tab"; tab: SettingsTabId }
  | { type: "toggle-request" }
  | { type: "toggle-success"; accepting: boolean }
  | { type: "toggle-failure" }
  | { type: "dismiss-toggle-error" }
  | { type: "open-dialog"; dialog: DialogKind }
  | { type: "close-dialog" }
  | { type: "dialog-confirmed" }
  | { type: "dialog-finished" };

// 로그인할 때마다 이 값으로 되돌린다. 주문받기는 매번 OFF로 시작한다 (스펙 2.2-1, Q03 답변 전).
const SIGNED_IN_DEFAULTS = {
  activeTab: "order-board",
  settingsTab: "widget",
  accepting: false,
  togglePending: false,
  toggleError: false,
} as const satisfies Partial<AppShellState>;

export function createInitialState(session: Session | null): AppShellState {
  return { session, ...SIGNED_IN_DEFAULTS, dialog: null, dialogPending: false };
}

export function appShellReducer(
  state: AppShellState,
  action: AppShellAction,
): AppShellState {
  switch (action.type) {
    case "login":
      return createInitialState(action.session);
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
