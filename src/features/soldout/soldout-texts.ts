// 메뉴품절 화면 문구 (SPEC-soldout 3 · 4장, 기획자 Q41 · Q42 · Q43).
export const SOLDOUT_TEXTS = {
  guide:
    "품절 상품을 삭제하면 해당 상품이 앱에서 다시 판매 가능 상태로 변경됩니다.",
  tabs: { all: "전체", temp: "일시품절", hidden: "숨김" },
  columns: {
    name: "상품명",
    kind: "구분",
    category: "카테고리",
    price: "금액",
    mode: "표시방식",
  },
  kind: { menu: "메뉴", option: "옵션" },
  mode: { temp: "일시품절", hidden: "숨김" },
  remove: "삭제",
  add: "+ 품절 상품 추가",
  empty: "품절 상품이 없습니다.",
  search: "상품명 검색",
  clearSearch: "검색어 지우기",
  noMatch: "검색된 품절 상품이 없습니다.",
  loading: "품절 목록을 불러오는 중입니다.",
  loadFailed: "품절 목록을 불러오지 못했습니다.",
  retry: "다시 시도",
  saved: "저장되었습니다",
  saveFailed: "저장하지 못했습니다. 다시 시도해 주세요.",
  confirmRemove: {
    title: "품절상품을 삭제하시겠습니까?",
    message: "삭제하면 앱에서 바로 다시 판매됩니다.",
    confirm: "확인",
    cancel: "취소",
  },
  popup: {
    title: "품절 상품 추가",
    search: "상품명 검색",
    searchPlaceholder: "상품명을 입력하세요",
    optionTab: "옵션",
    allTab: "전체",
    registered: "등록됨",
    selected: (n: number) => `${n}개 선택됨`,
    submit: "추가하기",
    submitting: "추가 중…",
    close: "닫기",
    added: (n: number) => `${n}개를 일시품절로 추가했습니다.`,
    // 서버가 체크한 것보다 적게 추가했을 때(다른 곳에서 먼저 등록). 문구는 개발이 정했다 (2026-11-19 사용자 결정).
    addedPartial: (n: number, skipped: number) =>
      `${n}개를 일시품절로 추가했습니다. ${skipped}개는 이미 품절로 등록돼 있습니다.`,
    allSkipped: (skipped: number) =>
      `${skipped}개는 이미 품절로 등록돼 있습니다.`,
    empty: "해당하는 상품이 없습니다.",
    loading: "상품 목록을 불러오는 중입니다.",
    loadFailed: "상품 목록을 불러오지 못했습니다.",
  },
} as const;
