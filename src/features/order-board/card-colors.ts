// 주문 카드 색 (주문접수 화면과 위젯이 같이 쓴다).
/** 색(p.11 그림) + 상태 글자. 색만으로 구분하지 않는다. */
export const CARD_COLORS = {
  pending: "border-yellow-400 bg-yellow-50",
  preparing: "border-blue-400 bg-blue-50",
  ready: "border-green-500 bg-green-50",
  "picked-up": "border-gray-400 bg-gray-100",
  "store-cancelled": "border-gray-400 bg-gray-100",
  "customer-cancelled": "border-gray-400 bg-gray-100",
} as const;
export const BUTTON_COLORS = {
  pending: "bg-yellow-500 text-gray-900",
  preparing: "bg-blue-600 text-white",
  ready: "bg-green-600 text-white",
} as const;
