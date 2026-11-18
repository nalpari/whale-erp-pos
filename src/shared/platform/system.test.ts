import { describe, expect, it } from "vitest";
import { getDeviceName } from "./system";

describe("getDeviceName", () => {
  it("Tauri 밖(브라우저 · 테스트)에서는 빈 문자열", async () => {
    await expect(getDeviceName()).resolves.toBe("");
  });
});
