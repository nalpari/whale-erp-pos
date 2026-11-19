// AI챗봇 인기메뉴 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (SPEC-settings-ai-popular 5장, 가정).
// 요청 · 응답 형태는 가정이다. 백엔드 요청 문서 7.2 #7과 맞추고, 협의 뒤 이 파일만 바꾼다.
import type { Catalog, CatalogItem, SoldOutApi, SoldOutMode } from "./soldout";

/** 인기메뉴는 메뉴만 된다(옵션 제외). soldOutMode는 지금 품절 상태: 없으면 null. */
type MenuItem = Extract<CatalogItem, { kind: "menu" }> & {
  soldOutMode: SoldOutMode | null;
};
export type PopularEntry = MenuItem & {
  /** 추가한 시각(ms). 작을수록 먼저 추가한 것이다. */
  addedAt: number;
};

/** 인기메뉴는 최대 5개다 (Q48). 서버도 같은 한도를 검사한다. */
export const POPULAR_LIMIT = 5;

export interface PopularApi {
  /** 실패하면 예외를 던진다. 10초 제한은 부르는 쪽(withTimeout)이 건다. */
  loadList(): Promise<PopularEntry[]>;
  /** 추가 팝업의 상품 목록. 메뉴만, 각 상품에 soldOutMode가 채워진다. */
  loadCatalog(): Promise<Catalog>;
  /** 한도 · 숨김 · 이미 등록된 코드는 서버가 무시하고, 실제로 추가된 항목만 돌려준다. */
  add(codes: string[]): Promise<PopularEntry[]>;
  remove(code: string): Promise<void>;
}

export type PopularRequestKind = "loadList" | "loadCatalog" | "add" | "remove";

export interface MockPopularOptions {
  /** 응답까지 걸리는 시간. 기본 300ms. */
  delayMs?: number;
  shouldFail?: (kind: PopularRequestKind) => boolean;
}

/** 상품 · 품절 정보는 메뉴품절 API(모의)에서 읽어, 두 화면이 같은 데이터를 본다. */
export function createMockPopularApi(
  soldOut: SoldOutApi,
  options: MockPopularOptions = {},
): PopularApi {
  const { delayMs = 300, shouldFail = () => false } = options;
  const now = Date.now();
  // 예시 인기메뉴 2개. 화면에서 바꾼 결과는 이 Map에 남는다(앱을 다시 켜면 처음 값으로 돌아간다).
  const stored = new Map<string, number>([
    ["M001", now - 2 * 60_000],
    ["M002", now - 60_000],
  ]);
  let clock = now;
  const reply = <T>(kind: PopularRequestKind, value: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail(kind)) reject(new Error("모의 서버 요청 실패"));
        else value().then(resolve, reject);
      }, delayMs);
    });
  const menus = async () => {
    const [catalog, soldList] = await Promise.all([
      soldOut.loadCatalog(),
      soldOut.loadList(),
    ]);
    const modes = new Map(soldList.map((e) => [e.code, e.mode]));
    const items = catalog.items.flatMap((i): MenuItem[] =>
      i.kind === "menu"
        ? [{ ...i, soldOutMode: modes.get(i.code) ?? null }]
        : [],
    );
    return { categories: catalog.categories, items };
  };
  const entryOf = (item: MenuItem): PopularEntry => ({
    ...item,
    addedAt: stored.get(item.code) ?? 0,
  });
  return {
    loadList: () =>
      reply("loadList", async () => {
        const { items } = await menus();
        return [...stored.keys()]
          .flatMap((code) => items.find((i) => i.code === code) ?? [])
          .map(entryOf);
      }),
    loadCatalog: () => reply("loadCatalog", menus),
    add: (codes) =>
      reply("add", async () => {
        const { items } = await menus();
        const room = POPULAR_LIMIT - stored.size;
        const fresh = [...new Set(codes)]
          .flatMap((c) => items.find((i) => i.code === c) ?? [])
          .filter((i) => !stored.has(i.code) && i.soldOutMode !== "hidden")
          .slice(0, Math.max(room, 0));
        const base = Math.max(clock + 1, Date.now());
        clock = base + fresh.length;
        fresh.forEach((i, n) => stored.set(i.code, base + n));
        return fresh.map(entryOf);
      }),
    remove: (code) =>
      reply("remove", async () => {
        stored.delete(code);
      }),
  };
}
