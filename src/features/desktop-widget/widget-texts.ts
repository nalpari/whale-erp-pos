// 위젯 문구. 상태 글자 · 버튼 글자는 주문접수 화면(T04)과 같은 값을 쓴다.
export const WIDGET_TEXTS = {
  title: "새 주문 알림",
  /** 위젯과 본 창의 연결이 계속 실패했을 때 (사용자 결정 A-2). */
  useMainWindow: "본 화면에서 처리해 주세요",
  closeAll: "위젯 닫기",
  closeCard: "이 주문 닫기",
  cancel: "주문취소",
  moreOrders: (n: number) => `+ ${n}건 더 있음`,
  pickedUp: "픽업완료",
  moreItems: (n: number) => `+ 외 ${n}개`,
} as const;
