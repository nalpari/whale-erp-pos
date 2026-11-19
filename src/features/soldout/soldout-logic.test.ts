import { describe, expect, it } from "vitest";
import type { CatalogItem, SoldOutEntry } from "../../shared/api/soldout";
import {
  categoryTab,
  filterByTab,
  filterCatalog,
  registeredCodes,
  sortRecent,
  tabCounts,
} from "./soldout-logic";

const item = (
  code: string,
  name: string,
  kind: "menu" | "option",
  categoryCode: string | null,
): CatalogItem => {
  const base = {
    code,
    name,
    categoryName: categoryCode ?? "옵션",
    price: 1000,
  };
  return kind === "menu"
    ? { ...base, kind, categoryCode: categoryCode ?? "none" }
    : { ...base, kind, categoryCode: null };
};
const entry = (
  code: string,
  mode: "temp" | "hidden",
  addedAt: number,
): SoldOutEntry => ({
  ...item(code, code, "menu", "coffee"),
  mode,
  addedAt,
});

const ITEMS = [
  item("A", "아메리카노", "menu", "coffee"),
  item("B", "카페라떼", "menu", "coffee"),
  item("C", "치즈케이크", "menu", "dessert"),
  item("O", "샷 추가", "option", null),
];

describe("soldout-logic", () => {
  it("탭 건수는 목록과 맞는다", () => {
    const list = [
      entry("A", "temp", 1),
      entry("B", "hidden", 2),
      entry("C", "temp", 3),
    ];
    expect(tabCounts(list)).toEqual({ all: 3, temp: 2, hidden: 1 });
    expect(filterByTab(list, "temp")).toHaveLength(2);
    expect(filterByTab(list, "all")).toHaveLength(3);
  });

  it("최근 추가 순으로 정렬하고 원본은 바꾸지 않는다", () => {
    const list = [
      entry("A", "temp", 1),
      entry("B", "temp", 3),
      entry("C", "temp", 2),
    ];
    expect(sortRecent(list).map((e) => e.code)).toEqual(["B", "C", "A"]);
    expect(list[0].code).toBe("A");
  });

  it("[전체]는 메뉴만, [옵션]은 옵션만 보인다", () => {
    expect(filterCatalog(ITEMS, "all", "").map((i) => i.code)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(filterCatalog(ITEMS, "option", "").map((i) => i.code)).toEqual([
      "O",
    ]);
  });

  it("카테고리로 거른다", () => {
    expect(
      filterCatalog(ITEMS, categoryTab("dessert"), "").map((i) => i.code),
    ).toEqual(["C"]);
  });

  it('서버 카테고리 코드가 "all" · "option"이어도 고정 탭과 겹치지 않는다', () => {
    const odd = [item("X", "특이", "menu", "option")];
    expect(filterCatalog(odd, categoryTab("option"), "")).toHaveLength(1);
    expect(filterCatalog(odd, "option", "")).toHaveLength(0);
  });

  it("검색어는 공백을 떼고 부분 일치로 거르며 카테고리와 함께 적용된다", () => {
    expect(filterCatalog(ITEMS, "all", " 라떼 ").map((i) => i.code)).toEqual([
      "B",
    ]);
    expect(filterCatalog(ITEMS, categoryTab("dessert"), "라떼")).toEqual([]);
    expect(filterCatalog(ITEMS, "option", "샷").map((i) => i.code)).toEqual([
      "O",
    ]);
  });

  it("등록됨은 일시품절 · 숨김 모두 포함한다", () => {
    const set = registeredCodes([
      entry("A", "temp", 1),
      entry("C", "hidden", 2),
    ]);
    expect(set.has("A")).toBe(true);
    expect(set.has("C")).toBe(true);
    expect(set.has("B")).toBe(false);
  });
});
