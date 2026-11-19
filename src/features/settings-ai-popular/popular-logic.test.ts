import { describe, expect, it } from "vitest";
import type { CatalogItem } from "../../shared/api/soldout";
import type { PopularEntry } from "../../shared/api/popular";
import { canPick, remainingSlots, sortOldestFirst } from "./popular-logic";

const menu = (soldOutMode?: "temp" | "hidden" | null): CatalogItem => ({
  code: "M1",
  name: "x",
  kind: "menu",
  categoryCode: "c",
  categoryName: "c",
  price: 1,
  soldOutMode,
});

describe("remainingSlots", () => {
  it("5에서 지금 개수를 뺀다. 음수는 0", () => {
    expect(remainingSlots(0)).toBe(5);
    expect(remainingSlots(2)).toBe(3);
    expect(remainingSlots(5)).toBe(0);
    expect(remainingSlots(7)).toBe(0);
  });
});

describe("canPick", () => {
  it("숨김은 못 고르고 일시품절 · 정상은 고른다", () => {
    expect(canPick(menu("hidden"))).toBe(false);
    expect(canPick(menu("temp"))).toBe(true);
    expect(canPick(menu(null))).toBe(true);
    expect(canPick(menu(undefined))).toBe(true);
  });
});

describe("sortOldestFirst", () => {
  it("먼저 추가한 것이 위, 시각이 같으면 받은 순서", () => {
    const e = (code: string, addedAt: number) =>
      ({ ...menu(null), code, addedAt }) as PopularEntry;
    expect(
      sortOldestFirst([e("b", 2), e("a", 1), e("c", 2)]).map((x) => x.code),
    ).toEqual(["a", "b", "c"]);
  });
});
