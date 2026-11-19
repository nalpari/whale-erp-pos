// AI챗봇 인기메뉴 화면 문구 (SPEC-settings-ai-popular 3 · 4 · 11장, 기획자 Q10 · Q48).
export const POPULAR_TEXTS = {
  guide:
    "AI챗봇 인기메뉴에 노출할 메뉴를 추가합니다. 최대 5개까지 설정할 수 있습니다.",
  readOnly: "AI챗봇 인기메뉴는 웨일ERP 계정으로 로그인해야 바꿀 수 있습니다.",
  count: (n: number) => `${n} / 5개`,
  add: "+ 인기상품 추가",
  remove: "삭제",
  empty: "설정한 인기메뉴가 없습니다.",
  loading: "인기메뉴를 불러오는 중입니다.",
  loadFailed: "인기메뉴를 불러오지 못했습니다.",
  retry: "다시 시도",
  saveFailed: "저장하지 못했습니다. 다시 시도해 주세요.",
  tag: { temp: "일시품절", hidden: "숨김" },
  columns: { name: "상품명", category: "카테고리", price: "금액" },
  confirmRemove: {
    title: "인기메뉴에서 삭제하시겠습니까?",
    message: "삭제하면 챗봇의 인기 메뉴에서 바로 빠집니다.",
    confirm: "확인",
    cancel: "취소",
  },
  popup: {
    title: "인기상품 추가",
    search: "상품명 검색",
    searchPlaceholder: "상품명을 입력하세요",
    allTab: "전체",
    registered: "등록됨",
    selected: (n: number, max?: number) =>
      max === undefined ? `${n}개 선택됨` : `${n}개 선택됨 (최대 ${max}개 더)`,
    submit: "추가하기",
    submitting: "추가 중…",
    close: "닫기",
    added: (n: number) => `${n}개를 인기메뉴에 추가했습니다.`,
    // 한도 · 숨김 · 이미 등록 등 이유가 여러 가지라 이유는 적지 않는다 (2026-11-19 사용자 결정).
    addedPartial: (n: number, skipped: number) =>
      `${n}개를 인기메뉴에 추가했습니다. ${skipped}개는 추가하지 못했습니다.`,
    allSkipped: (skipped: number) => `${skipped}개는 추가하지 못했습니다.`,
    limitReached: "최대 5개까지 설정할 수 있습니다.",
    empty: "해당하는 상품이 없습니다.",
    loading: "상품 목록을 불러오는 중입니다.",
    loadFailed: "상품 목록을 불러오지 못했습니다.",
  },
} as const;
