import { describe, expect, it } from "vitest";
import { normalizeStoreCode } from "./store-code";

describe("normalizeStoreCode (스펙 3.1-2)", () => {
  it("소문자는 대문자로, 앞뒤 공백은 지운다", () => {
    expect(normalizeStoreCode("  st000001 ")).toBe("ST000001");
  });
  it("형식은 검사하지 않고 20자까지만 남긴다", () => {
    expect(normalizeStoreCode("a-b_c!")).toBe("A-B_C!");
    expect(normalizeStoreCode("a".repeat(25))).toBe("A".repeat(20));
  });
});
