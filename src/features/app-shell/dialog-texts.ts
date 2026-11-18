// 팝업 문구는 기획자 답변 원문(Q04 · Q06)과 글자 하나까지 같게 둔다. 기본 문구는 화면정의서 v0.8 p.5~6.
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
  restart: {
    title: "다시시작하시겠습니까?",
    message: "다시 켜면 주문받기가 꺼집니다.",
    confirmLabel: "다시시작",
  },
  logout: {
    title: "로그아웃 하시겠습니까?",
    message: "주문 수신이 자동으로 중단됩니다.",
    confirmLabel: "로그아웃",
  },
  exit: {
    title: "프로그램을 종료하시겠습니까?",
    message: "주문 수신이 자동으로 중단됩니다.",
    confirmLabel: "프로그램 종료",
  },
};

const LOSE_ORDERS =
  "프로그램을 끄면 이 주문을 처리하거나 고객에게 알림을 보낼 수 없습니다.";

const WARNING_TAILS: Record<DialogKind, string> = {
  "stop-orders": "주문받기를 꺼도 이 주문은 처리해야 합니다.",
  restart: "다시 켜도 이 주문은 그대로 처리할 수 있습니다.",
  logout: LOSE_ORDERS,
  exit: LOSE_ORDERS,
};

/** 처리할 주문(접수대기 · 제조중 · 제조완료)이 1건 이상일 때만 확인창에 더하는 경고 한 줄 (Q04). 0건이면 null. */
export function pendingOrdersWarning(
  kind: DialogKind,
  count: number,
): string | null {
  if (count < 1) return null;
  return `처리할 주문이 ${count}건 있습니다. ${WARNING_TAILS[kind]}`;
}

/** 서버 요청이 실패했을 때 토스트 문구 (스펙 2.2-5. Q51 ②의 "잠시 뒤"를 스펙이 "잠시 후"로 정했다). */
export const TOGGLE_ERROR_MESSAGE =
  "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
