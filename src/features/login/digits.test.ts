import { describe, expect, it } from "vitest";
import { onlyDigits } from "./digits";

describe("onlyDigits", () => {
  it("하이픈 · 공백 · 글자를 빼고 숫자만 남긴다", () => {
    expect(onlyDigits("010-12 34ab5")).toBe("01012345");
    expect(onlyDigits("abc")).toBe("");
  });
});
