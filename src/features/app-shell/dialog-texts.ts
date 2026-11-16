// 팝업 문구는 화면정의서 v0.8 원문과 글자 하나까지 같게 둔다 (p.5 토글 OFF, p.6 로그아웃 · 시스템종료).
import type { DialogKind } from "./app-shell-state";

export const DIALOG_TEXTS: Record<
  DialogKind,
  { title: string; message: string; confirmLabel: string }
> = {
  "stop-orders": {
    title: "주문 수신을 중단하시겠습니까?",
    message: "주문 수신이 중단되면 고객은 앱에서 주문을 할 수 없습니다.",
    confirmLabel: "주문 중단",
  },
  logout: {
    title: "로그아웃 하시겠습니까?",
    message: "주문 수신이 자동으로 중단됩니다.",
    confirmLabel: "로그아웃",
  },
  shutdown: {
    title: "시스템을 종료하겠습니까?",
    message: "주문 수신이 자동으로 중단됩니다.",
    confirmLabel: "시스템 종료",
  },
};

/** 화면정의서에 없는 임시 문구 (사용자 결정 2026-11-16, 스펙 2.2-5). */
export const TOGGLE_ERROR_MESSAGE =
  "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
