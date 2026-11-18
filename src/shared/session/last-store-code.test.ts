import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLastStoreCode, saveLastStoreCode } from "./last-store-code";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("마지막 점포코드 (스펙 3.3)", () => {
  it("저장한 값을 읽는다. 없으면 빈 문자열", () => {
    expect(loadLastStoreCode()).toBe("");
    saveLastStoreCode("ST000001");
    expect(loadLastStoreCode()).toBe("ST000001");
  });

  it("저장소가 막혀도 던지지 않고 빈 값을 준다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveLastStoreCode("ST000001")).not.toThrow();
    expect(loadLastStoreCode()).toBe("");
  });
});
