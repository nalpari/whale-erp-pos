import { describe, expect, it } from "vitest";
import type { Session } from "../api/auth";
import { canEditSettings } from "./permissions";

const base: Omit<Session, "accountType"> = {
  store: { id: "s1", name: "시험 점포" },
  accessToken: "t",
};

describe("canEditSettings (스펙 9장 2)", () => {
  it("점포번호 계정은 거짓", () => {
    expect(canEditSettings({ ...base, accountType: "store" })).toBe(false);
  });

  it("마스터 계정은 참", () => {
    expect(canEditSettings({ ...base, accountType: "master" })).toBe(true);
  });
});
