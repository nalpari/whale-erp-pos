// 주문설정 화면 문구 (SPEC-settings-order 3 · 4장).
export const ORDER_SETTINGS_TEXTS = {
  title: "주문 처리 시간을 설정합니다.",
  autoCancel: {
    label: "접수하지 않은 주문을 자동으로 취소하는 시간",
    note: "이 시간 동안 접수하지 않으면 주문이 취소되고 고객에게 자동 환불됩니다.",
  },
  arrivalMin: {
    label: "고객이 고를 수 있는 가장 빠른 도착 시간",
    note: "고객 앱에는 이 시간부터 5분 단위로 보입니다.",
  },
  minutes: (m: number) => `${m}분`,
  saved: "저장되었습니다",
  saveFailed: "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
  loading: "설정을 불러오는 중입니다.",
  loadFailed: "설정을 불러오지 못했습니다.",
  retry: "다시 시도",
} as const;
