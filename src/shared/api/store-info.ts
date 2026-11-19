// 매장정보 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (SPEC-store-info 5장, 가정).
// 아래 칸 이름과 요청 · 응답 형태는 가정이다. 백엔드 요청 문서 7.2 #5와 맞추고, 협의 뒤 이 파일만 바꾼다.
export interface StoreInfo {
  /** 점포 소개 (필수. 한도는 INTRO_LIMIT). */
  intro: string;
  /** 점포 공지 (한도는 NOTICE_LIMIT). 비어 있어도 된다. */
  notice: string;
  noticeVisible: boolean;
  /** 체크한 태그의 코드. 이름은 서버가 준 목록에서 찾는다. */
  selectedTags: string[];
  tagsVisible: boolean;
}

export interface TagGroup {
  name: string;
  tags: { code: string; name: string }[];
}

export interface StoreInfoData {
  info: StoreInfo;
  /** 웨일ERP 공통코드의 묶음 · 태그. 화면은 이 목록을 그대로 보인다. */
  tagGroups: TagGroup[];
}

export interface StoreInfoApi {
  /** 실패하면 예외를 던진다. 10초 제한은 부르는 쪽(withTimeout)이 건다. */
  load(): Promise<StoreInfoData>;
  /** 실패하면 예외를 던진다. 제한 시간이 지나도 서버에는 반영됐을 수 있다(늦은 응답은 버려진다). */
  save(info: StoreInfo): Promise<void>;
}

// 1차 태그 12개 (스펙 3장 4번). 실제 목록은 서버에서 온다.
const MOCK_TAG_GROUPS: TagGroup[] = [
  {
    name: "결제수단",
    tags: [
      { code: "zeropay", name: "제로페이" },
      { code: "applepay", name: "애플페이" },
    ],
  },
  {
    name: "편의",
    tags: [
      { code: "parking", name: "주차" },
      { code: "seats", name: "좌석보유" },
      { code: "wifi", name: "와이파이" },
      { code: "restroom", name: "화장실" },
    ],
  },
  {
    name: "동반",
    tags: [
      { code: "pet", name: "반려동물" },
      { code: "highchair", name: "유아의자" },
      { code: "kids", name: "유아시설" },
    ],
  },
  {
    name: "운영",
    tags: [
      { code: "delivery", name: "배달" },
      { code: "all-year", name: "연중무휴" },
      { code: "split-restroom", name: "남녀화장실구분" },
    ],
  },
];

export interface MockStoreInfoOptions {
  /** 응답까지 걸리는 시간. 기본 300ms. */
  delayMs?: number;
  /** true면 그 요청을 실패시킨다. 테스트에서 실패를 만들 때 쓴다. */
  shouldFail?: (kind: "load" | "save") => boolean;
}

export function createMockStoreInfoApi(
  options: MockStoreInfoOptions = {},
): StoreInfoApi {
  const { delayMs = 300, shouldFail = () => false } = options;
  // 저장하면 이 값이 바뀌어 다시 열 때 보인다 (스펙 5장).
  let stored: StoreInfo = {
    intro: "갓 내린 커피와 수제 디저트를 파는 동네 카페입니다.",
    notice: "매주 월요일은 쉽니다.",
    noticeVisible: true,
    selectedTags: ["wifi", "parking"],
    tagsVisible: true,
  };
  const reply = <T>(kind: "load" | "save", value: () => T) =>
    new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail(kind)) reject(new Error("모의 서버 요청 실패"));
        else resolve(value());
      }, delayMs);
    });
  return {
    load: () =>
      reply("load", () => ({
        info: { ...stored, selectedTags: [...stored.selectedTags] },
        tagGroups: MOCK_TAG_GROUPS,
      })),
    save: (info) =>
      reply("save", () => {
        stored = { ...info, selectedTags: [...info.selectedTags] };
      }),
  };
}
