// 메뉴품절 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (SPEC-soldout 5장, 가정).
// 아래 칸 이름과 요청 · 응답 형태는 가정이다. 백엔드 요청 문서 7.2 #6과 맞추고, 협의 뒤 이 파일만 바꾼다.

/** 일시품절: 앱에 보이지만 고를 수 없음. 숨김: 앱에 보이지 않음 (Q43 ①). */
export type SoldOutMode = "temp" | "hidden";

export interface CatalogCategory {
  code: string;
  name: string;
}

interface CatalogItemBase {
  /** 상품 · 옵션 코드. 로그에도 이것만 남긴다. */
  code: string;
  name: string;
  categoryName: string;
  price: number;
  /** 품절 상태. 인기메뉴 API만 채운다(메뉴품절 API의 상품 목록에는 없다). */
  soldOutMode?: SoldOutMode | null;
}

/** 메뉴는 카테고리 코드가 있고, 옵션은 카테고리가 없어 null이다. */
export type CatalogItem =
  | (CatalogItemBase & { kind: "menu"; categoryCode: string })
  | (CatalogItemBase & { kind: "option"; categoryCode: null });

export interface Catalog {
  categories: CatalogCategory[];
  items: CatalogItem[];
}

export type SoldOutEntry = CatalogItem & {
  mode: SoldOutMode;
  /** 추가한 시각(ms). 클수록 최근이다. */
  addedAt: number;
};

export interface SoldOutApi {
  /** 실패하면 예외를 던진다. 10초 제한은 부르는 쪽(withTimeout)이 건다. */
  loadList(): Promise<SoldOutEntry[]>;
  loadCatalog(): Promise<Catalog>;
  /** 여러 개를 일시품절로 한 번에 추가하고, 서버가 만든 항목을 돌려준다. 이미 등록된 코드는 무시한다. */
  add(codes: string[]): Promise<SoldOutEntry[]>;
  setMode(code: string, mode: SoldOutMode): Promise<void>;
  remove(code: string): Promise<void>;
}

export type SoldOutRequestKind =
  "loadList" | "loadCatalog" | "add" | "setMode" | "remove";

const OPTION_CATEGORY = "옵션";

const CATEGORIES: CatalogCategory[] = [
  { code: "coffee", name: "커피" },
  { code: "non-coffee", name: "논커피" },
  { code: "tea", name: "티" },
  { code: "dessert", name: "디저트" },
];

// [코드, 이름, 카테고리 코드, 금액]
const MENUS: [string, string, string, number][] = [
  ["M001", "아메리카노", "coffee", 4500],
  ["M002", "카페라떼", "coffee", 5000],
  ["M003", "바닐라라떼", "coffee", 5500],
  ["M004", "카푸치노", "coffee", 5000],
  ["M005", "콜드브루", "coffee", 5000],
  ["M006", "에스프레소", "coffee", 4000],
  ["M007", "초코라떼", "non-coffee", 5500],
  ["M008", "딸기라떼", "non-coffee", 6000],
  ["M009", "녹차라떼", "non-coffee", 5500],
  ["M010", "고구마라떼", "non-coffee", 6000],
  ["M011", "캐모마일", "tea", 4500],
  ["M012", "얼그레이", "tea", 4500],
  ["M013", "유자차", "tea", 5000],
  ["M014", "페퍼민트", "tea", 4500],
  ["M015", "치즈케이크", "dessert", 6500],
  ["M016", "티라미수", "dessert", 7000],
  ["M017", "크루아상", "dessert", 4000],
  ["M018", "마들렌", "dessert", 3000],
  ["M019", "스콘", "dessert", 3500],
  ["M020", "브라우니", "dessert", 4500],
];

const OPTIONS: [string, string, number][] = [
  ["O001", "샷 추가", 500],
  ["O002", "시럽 추가", 500],
  ["O003", "휘핑크림 추가", 500],
  ["O004", "두유 변경", 700],
];

const MOCK_ITEMS: CatalogItem[] = [
  ...MENUS.map(([code, name, categoryCode, price]): CatalogItem => ({
    code,
    name,
    kind: "menu",
    categoryCode,
    categoryName: CATEGORIES.find((c) => c.code === categoryCode)!.name,
    price,
  })),
  ...OPTIONS.map(([code, name, price]): CatalogItem => ({
    code,
    name,
    kind: "option",
    categoryCode: null,
    categoryName: OPTION_CATEGORY,
    price,
  })),
];

export interface MockSoldOutOptions {
  /** 응답까지 걸리는 시간. 기본 300ms. */
  delayMs?: number;
  /** true면 그 요청을 실패시킨다. 테스트에서 실패를 만들 때 쓴다. */
  shouldFail?: (kind: SoldOutRequestKind) => boolean;
}

export function createMockSoldOutApi(
  options: MockSoldOutOptions = {},
): SoldOutApi {
  const { delayMs = 300, shouldFail = () => false } = options;
  const now = Date.now();
  // 예시 품절 3개. 화면에서 바꾼 결과는 이 Map에 남아 탭을 다시 열어도 보인다(앱을 다시 켜면 처음 값으로 돌아간다. 스펙 5장).
  const stored = new Map<string, { mode: SoldOutMode; addedAt: number }>([
    ["M001", { mode: "temp", addedAt: now - 3 * 60_000 }],
    ["M015", { mode: "hidden", addedAt: now - 2 * 60_000 }],
    ["O001", { mode: "temp", addedAt: now - 60_000 }],
  ]);
  // 같은 밀리초에 두 번 추가해도 나중 것이 위에 오게 시계를 앞으로만 간다.
  let clock = now;
  const itemOf = (code: string) => MOCK_ITEMS.find((i) => i.code === code);
  const entryOf = (code: string): SoldOutEntry | null => {
    const item = itemOf(code);
    const state = stored.get(code);
    return item && state ? { ...item, ...state } : null;
  };
  const reply = <T>(kind: SoldOutRequestKind, value: () => T) =>
    new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail(kind)) reject(new Error("모의 서버 요청 실패"));
        else resolve(value());
      }, delayMs);
    });
  return {
    loadList: () =>
      reply("loadList", () =>
        [...stored.keys()].flatMap((code) => entryOf(code) ?? []),
      ),
    loadCatalog: () =>
      reply("loadCatalog", () => ({
        categories: CATEGORIES,
        items: MOCK_ITEMS,
      })),
    add: (codes) =>
      reply("add", () => {
        const fresh = codes.filter((c) => itemOf(c) && !stored.has(c));
        const base = Math.max(clock + 1, Date.now());
        clock = base + fresh.length;
        fresh.forEach((code, i) =>
          stored.set(code, { mode: "temp", addedAt: base + fresh.length - i }),
        );
        return fresh.flatMap((c) => entryOf(c) ?? []);
      }),
    setMode: (code, mode) =>
      reply("setMode", () => {
        const state = stored.get(code);
        if (state) state.mode = mode;
      }),
    remove: (code) =>
      reply("remove", () => {
        stored.delete(code);
      }),
  };
}
