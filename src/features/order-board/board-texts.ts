// 기획자 답변에서 온 문구(Q01 · Q19 · Q20 · Q22 · Q24 · Q26)는 원문과 글자 하나까지 같게 둔다.
// 빈 화면 · 「처리 중…」 · 정렬 칸 이름은 개발 추가다 (스펙 11장 F), 상태 글자 · 이전/다음은 화면정의서 p.11이다.
import type { OrderStatus } from "../../shared/api/orders";

export const BOARD_TABS = [
  { id: "board", label: "접수대기 · 제조중 · 제조완료" },
  { id: "picked-up", label: "픽업완료" },
] as const;
export type BoardTabId = (typeof BOARD_TABS)[number]["id"];

import type { SortOrder } from "./order-board-logic";

export const SORT_LABELS = {
  newest: "최신순",
  oldest: "오래된순",
} as const satisfies Record<SortOrder, string>;
export const SORT_SELECT_LABEL = "정렬";

/** 카드 머리의 상태 글자. 색만으로 구분하지 않는다 (스펙 2.3). */
export const STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  pending: "접수대기",
  preparing: "제조중",
  ready: "제조완료",
  "picked-up": "픽업완료",
};

/** 상태별 카드 버튼 글자. 픽업완료에는 버튼이 없다. */
export const ACTION_BUTTONS = {
  pending: { action: "accept", label: "주문접수" },
  preparing: { action: "complete", label: "제조완료" },
  ready: { action: "pickup", label: "픽업완료" },
} as const;

export const BOARD_TEXTS = {
  moreItems: (n: number) => `+ 외 ${n}개`,
  autoCancelWarning: "3분 뒤 자동 취소",
  busy: "처리 중…",
  emptyBoard: "처리할 주문이 없습니다.",
  emptyPickedUp: "오늘 픽업완료한 주문이 없습니다.",
  prev: "이전",
  next: "다음",
  pickupBanner: (n: number) => `픽업번호 #${n} 픽업완료 되었습니다.`,
  undoPickup: (seconds: number) =>
    `완료 취소(${String(seconds).padStart(2, "0")})`,
  /** 실패 토스트 앞에 픽업번호를 붙인다 (사용자 결정 2026-11-18). T03 문구 원문은 그대로 둔다. */
  failureToast: (n: number, message: string) => `#${n} ${message}`,
  customerCancelBanner: (n: number) =>
    `픽업번호 #${n} 고객이 주문을 취소했습니다.`,
} as const;
