// 출력 · 실패 띠 · 영수증 미리보기 문구 (T12 스펙 3 · 4 · 5장).
export const PRINT_TEXTS = {
  noOrderPrinter: "주문서를 출력할 프린터가 없습니다.",
  receiptPrinted: "영수증을 출력했습니다.",
  unprinted: "미출력",
  orderFailedBanner: (detail: string) =>
    `주문서를 출력하지 못했습니다. (${detail})`,
  /** 「슬롯 1 SEWOO: 이유」 */
  failedSlot: (number: number, printerName: string, reason: string) =>
    `슬롯 ${number} ${printerName}: ${reason}`,
  retryPrint: "다시 인쇄",
  dismissBanner: "닫기",
  printOrder: "주문서 인쇄",
  printing: "출력 중…",
  receiptPreviewTitle: "영수증 미리보기",
  receiptPrint: "영수증 인쇄",
  receiptClose: "닫기",
  receiptLoading: "영수증 정보를 불러오는 중…",
  receiptLoadFailed: "영수증 정보를 불러오지 못했습니다.",
  receiptRetry: "다시 시도",
  receiptFailed: (detail: string) =>
    `영수증을 출력하지 못했습니다. (${detail})`,
  settingsFailed: "프린터 설정을 읽지 못함",
  /** 30초 안에 끝나지 않았다 (Q47). */
  unknownResult: "출력 결과를 확인할 수 없음",
  unknownResultBanner: (detail: string) =>
    `출력 결과를 확인할 수 없습니다. (${detail})`,
  /** 이유 없이 「슬롯 1 SEWOO」만. */
  slotOnly: (number: number, printerName: string) =>
    `슬롯 ${number} ${printerName}`,
  receiptUnknown: (detail: string) =>
    `영수증 출력 결과를 확인할 수 없습니다. (${detail})`,
  noPrinterNow: "출력할 프린터가 없음",
  noReceiptPrinter: "영수증을 출력할 프린터가 없습니다.",
} as const;

/** 주문서 · 영수증 글자. 양식 문구는 여기 한 곳에 둔다. */
export const FORM_TEXTS = {
  orderTitle: "픽업오더 주문서 (주방 / 바리스타용)",
  reprint: (time: string) => `[재출력] ${time}`,
  remake: (time: string) => `[재제조] ${time}`,
  remakeReason: "사유",
  orderNumber: "주문번호",
  orderedAt: "주문일시",
  customer: "주문자",
  pickupAt: "픽업예정",
  note: "요청사항",
  receiptTitle: "영수증",
  cancelReceiptTitle: "취소 영수증",
  phone: "전화번호",
  address: "주소",
  representative: "대표자",
  businessNumber: "사업자번호",
  soldAt: "판매일자",
  orderAmount: "주문금액",
  paidAmount: "결제금액",
  taxable: "과세금액",
  vat: "부가세",
  paidZero: "결제 금액 0원",
  method: "결제수단",
  cardNumber: "카드번호",
  cardKind: "거래종류",
  cardDivision: "거래구분",
  approvalNumber: "승인번호",
  approvedAt: "승인일시",
  acquirer: "매입사명",
  discount: {
    promotion: "프로모션 할인",
    coupon: "쿠폰 할인",
    stamp: "스탬프 할인",
    point: "포인트 할인",
  },
} as const;
