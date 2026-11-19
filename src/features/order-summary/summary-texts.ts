// 문구는 기획자 답변(Q17 · Q18 · Q27)과 화면정의서 p.7 · p.12를 따른다. 정보 칸 이름(주문일시 등)은 p.12 그림의 이름이다.
export const SUMMARY_TEXTS = {
  close: "닫기",
  steps: "처리 단계",
  orderedAt: "주문일시",
  orderNumber: "주문번호",
  pickupAt: "픽업 예정",
  customer: "고객명",
  phone: "연락처",
  note: "요청사항",
  menu: "메뉴",
  printReceipt: "영수증 인쇄",
  printOrder: "주문서 인쇄",
  cancel: "주문취소",
} as const;

/** 취소 사유 팝업 (스펙 3장, Q17 · Q18). 고른 문구가 서버로 그대로 간다. */
export const CANCEL_TEXTS = {
  title: "주문을 취소하시겠습니까?",
  guide: "취소사유를 선택하세요.",
  reasons: [
    "재료가 소진되었습니다",
    "주문이 많아 준비가 어렵습니다",
    "영업이 종료되었습니다",
    "매장 사정으로 주문을 취소합니다",
  ],
  custom: "직접 입력",
  customLabel: "취소 사유 직접 입력",
  customNotice: "입력한 사유는 고객에게 보입니다.",
  tooLong: "50자까지 입력할 수 있습니다.",
  back: "닫기",
  confirm: "주문취소",
  busy: "처리 중…",
} as const;
