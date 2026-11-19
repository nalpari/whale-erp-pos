// 메뉴품절 순수 함수 (SPEC-soldout 3 · 4 · 8장). 화면 상태 없이 목록만 다룬다.
import type {
  CatalogItem,
  SoldOutEntry,
  SoldOutMode,
} from "../../shared/api/soldout";

export type StatusTab = "all" | SoldOutMode;

/** 추가 팝업의 카테고리 탭: 맨 앞 전체, 서버 카테고리, 맨 끝 옵션 (SPEC 11장 B). */
export type CategoryTab = "all" | "option" | `cat:${string}`;

/** 서버 카테고리 코드에 접두를 붙여, 서버 코드가 "all" · "option"이어도 고정 탭과 겹치지 않게 한다. */
export const categoryTab = (code: string): CategoryTab => `cat:${code}`;

export function tabCounts(entries: SoldOutEntry[]) {
  const temp = entries.filter((e) => e.mode === "temp").length;
  return { all: entries.length, temp, hidden: entries.length - temp };
}

export function filterByTab(entries: SoldOutEntry[], tab: StatusTab) {
  return tab === "all" ? entries : entries.filter((e) => e.mode === tab);
}

/** 최근에 추가한 것이 위. 시각이 같으면 받은 순서를 지킨다. */
export function sortRecent(entries: SoldOutEntry[]) {
  return [...entries].sort((a, b) => b.addedAt - a.addedAt);
}

/** 상품명 검색: 앞뒤 공백과 대소문자를 무시한 부분 일치. 빈 검색어는 모두 맞는다. */
export function matchesName(name: string, query: string) {
  const q = query.trim().toLowerCase();
  return q === "" || name.toLowerCase().includes(q);
}

/** 품절 목록을 상품명으로 거른다. */
export function filterByName(entries: SoldOutEntry[], query: string) {
  return entries.filter((e) => matchesName(e.name, query));
}

/** 카테고리 탭과 검색어로 거른다. [전체]는 메뉴만, 옵션은 [옵션] 탭에서만 보인다. */
export function filterCatalog(
  items: CatalogItem[],
  category: CategoryTab,
  query: string,
) {
  return items.filter((item) => {
    if (category === "option") {
      if (item.kind !== "option") return false;
    } else if (item.kind !== "menu") {
      return false;
    } else if (
      category !== "all" &&
      categoryTab(item.categoryCode) !== category
    ) {
      return false;
    }
    return matchesName(item.name, query);
  });
}

/** 이미 품절로 등록된 코드 모음 (일시품절 · 숨김 모두). */
export function registeredCodes(entries: SoldOutEntry[]) {
  return new Set(entries.map((e) => e.code));
}

export function formatPrice(price: number) {
  return `${price.toLocaleString("ko-KR")}원`;
}
