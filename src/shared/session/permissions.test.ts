import { describe, expect, it } from "vitest";
import type { Session } from "../api/auth";
import { canEditSetting } from "./permissions";

const base: Omit<Session, "accountType"> = {
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

// 스펙 2장 권한 표 (Q10).
describe("canEditSetting (스펙 9장 5)", () => {
  it.each([
    ["store", "widget", true],
    ["store", "printer", true],
    ["store", "aiPopular", false],
    ["master", "widget", true],
    ["master", "printer", true],
    ["master", "aiPopular", true],
  ] as const)("%s 계정 · %s → %s", (accountType, kind, expected) => {
    expect(canEditSetting({ ...base, accountType }, kind)).toBe(expected);
  });
});
