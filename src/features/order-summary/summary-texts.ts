// 문구는 기획자 답변(Q17 · Q18 · Q27)과 화면정의서 p.7 · p.12를 따른다. 정보 칸 이름(주문일시 등)은 p.12 그림의 이름이다.
export const SUMMARY_TEXTS = {
  close: "닫기",
  steps: "처리 단계",
  orderedAt: "주문일시",
  orderNumber: "주문번호",
  arrivalAt: "도착 예정",
  customer: "고객명",
  phone: "연락처",
  note: "요청사항",
  menu: "메뉴",
  printReceipt: "영수증 인쇄",
  printOrder: "주문서 인쇄",
  cancel: "주문취소",
  remake: "재제조",
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

/**
 * 재제조 팝업 (SPEC-remake 3장). 사유 목록은 2026-11-25 초안이고 나중에 더한다: 이 목록 하나만 고친다.
 * fault: 「고객 주문 실수」만 고객 실수(Q62), 나머지(직접 입력 포함)는 매장 과실. 로그에는 목록 번호(1부터)만 남긴다.
 * 번호는 로그를 읽는 기준이다: 새 사유는 맨 끝(「직접 입력」 뒤)에 더하고, 있는 항목의 순서는 바꾸지 않는다.
 */
export const REMAKE_TEXTS = {
  title: "재제조하시겠습니까?",
  menuGuide: "다시 만들 메뉴를 선택하세요.",
  ordered: (n: number) => `주문 ${n}개`,
  decrease: (name: string) => `${name} 수량 줄이기`,
  increase: (name: string) => `${name} 수량 늘리기`,
  quantity: (name: string) => `${name} 재제조 수량`,
  guide: "재제조 사유를 선택하세요.",
  reasons: [
    { label: "메뉴를 잘못 만들었습니다", fault: "store" },
    { label: "맛 · 품질 문제", fault: "store" },
    { label: "이물질", fault: "store" },
    { label: "고객 주문 실수", fault: "customer" },
    { label: "직접 입력", fault: "store", custom: true },
  ],
  customLabel: "재제조 사유 직접 입력",
  back: "닫기",
  confirm: "재제조",
  busy: "처리 중…",
  done: "재제조를 등록했습니다.",
} as const;
