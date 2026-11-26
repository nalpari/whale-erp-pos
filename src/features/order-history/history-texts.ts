// 주문내역 문구. 기획자 답변(Q34 · Q35 · Q36)과 SPEC-order-history의 문구를 따른다.
import type { DiscountKind, HistoryTab } from "../../shared/api/order-history";
import type { OrderStatus } from "../../shared/api/orders";
import type { PresetId } from "./history-logic";

export const HISTORY_TABS: readonly { id: HistoryTab; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "pending", label: "접수대기" },
  { id: "preparing", label: "제조중" },
  { id: "ready", label: "제조완료" },
  { id: "picked-up", label: "픽업완료" },
  { id: "cancelled", label: "취소" },
];

export const PRESET_LABELS: Record<PresetId, string> = {
  today: "오늘",
  yesterday: "어제",
  "this-month": "이번 달",
  "last-month": "최근 한 달",
};

/** 상태 글자와 글자색 (2.4). 색만으로 구분하지 않도록 글자도 함께 보인다. */
export const STATUS_VIEW: Record<
  OrderStatus,
  { label: string; color: string }
> = {
  pending: { label: "접수대기", color: "text-orange-600" },
  preparing: { label: "제조중", color: "text-blue-600" },
  ready: { label: "제조완료", color: "text-green-600" },
  "picked-up": { label: "픽업완료", color: "text-gray-900" },
  "store-cancelled": { label: "매장취소", color: "text-red-600" },
  "customer-cancelled": { label: "고객취소", color: "text-red-600" },
};

export const DISCOUNT_LABELS: Record<DiscountKind, string> = {
  promotion: "프로모션 할인",
  coupon: "쿠폰 할인",
  stamp: "스탬프 할인",
  point: "포인트 할인",
};

export const HISTORY_TEXTS = {
  searchLabel: "주문 검색",
  searchPlaceholder: "휴대폰 번호 끝 4자리 · 픽업번호 · 주문번호",
  searchNotice: "최근 한 달에서 검색한 결과입니다",
  refresh: "새로 고침",
  periodLabel: "조회 기간",
  prevPeriod: "이전 기간",
  nextPeriod: "다음 기간",
  openCalendar: "달력 열기",
  calendarConfirm: "확인",
  calendarOlder: "이전 내역은 웨일ERP에서 볼 수 있습니다.",
  calendarPrevMonth: "이전 달",
  calendarNextMonth: "다음 달",
  tabsLabel: "주문 상태",
  empty: "조회된 주문이 없습니다.",
  loading: "불러오는 중…",
  listFailed: "주문내역을 불러오지 못했습니다.",
  staleFailed: "최신 정보를 불러오지 못했습니다.",
  detailFailed: "주문 정보를 불러오지 못했습니다.",
  retry: "다시 시도",
  pageSize: "페이지당 건수",
  pageSizeOption: (n: number) => `${n}건씩`,
  prevPage: "이전",
  nextPage: "다음",
  columns: ["픽업번호", "고객", "메뉴", "금액", "상태", "주문일시"],
  // 상세
  back: "← 이전",
  menu: "주문 메뉴",
  menuColumns: ["메뉴", "단가", "수량", "금액"],
  total: "합계",
  basicInfo: "기본 정보",
  orderedAt: "주문일시",
  orderNumber: "주문번호",
  customer: "고객명",
  phone: "연락처",
  pickupAt: "픽업 예정",
  note: "요청사항",
  payment: "결제정보",
  orderAmount: "주문금액",
  paidAmount: "결제금액",
  method: "결제수단",
  paidAt: "결제시각",
  transactionId: "거래번호",
  history: "처리 이력",
  printReceipt: "영수증 인쇄",
  printOrder: "주문서 인쇄",
  cancel: "주문취소",
  remake: "재제조",
  busy: "처리 중…",
} as const;
