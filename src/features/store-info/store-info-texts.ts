// 매장정보 화면 문구 (SPEC-store-info 3 · 4 · 11장, 기획자 Q38 · Q40 · Q42).
export const STORE_INFO_TEXTS = {
  guide:
    "매장정보는 픽업오더 앱에 표시됩니다. 점포 소개와 점포 공지는 매장 화면에, 편의시설 및 서비스는 점포정보 화면에 표시됩니다.",
  intro: "점포 소개",
  introRequired: "점포 소개를 입력해 주세요.",
  notice: "점포 공지",
  tags: "편의시설 및 서비스",
  shown: "앱에 표시",
  hidden: "표시 안 함",
  save: "저장",
  saving: "저장 중…",
  saved: "저장되었습니다",
  saveFailed: "저장하지 못했습니다. 다시 시도해 주세요.",
  loading: "매장정보를 불러오는 중입니다.",
  loadFailed: "매장정보를 불러오지 못했습니다.",
  retry: "다시 시도",
  tooLong: (max: number) => `${max}자까지 입력할 수 있습니다.`,
  tooManyLines: (max: number) => `${max}줄까지 입력할 수 있습니다.`,
  leave: {
    title: "저장하지 않은 내용이 있습니다.",
    message: "나가면 고친 내용이 사라집니다. 나가시겠습니까?",
    confirm: "나가기",
    cancel: "취소",
  },
} as const;
