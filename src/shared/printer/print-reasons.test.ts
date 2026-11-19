import { describe, expect, it } from "vitest";
// Rust 소스를 글자 그대로 읽는다(Vite ?raw).
import printerSource from "../../../src-tauri/src/printer.rs?raw";
import { printFailReason, UNKNOWN_REASON } from "./print-reasons";

describe("출력 실패 이유 (T12 스펙 5장)", () => {
  it("Rust(printer.rs)가 돌려주는 모든 이유 문구를 그대로 통과시킨다", () => {
    // 한쪽 글자만 바뀌면 모든 띠가 「알 수 없는 오류」로 조용히 바뀌므로 소스에서 읽어 맞춰 본다.
    const reasons = [
      ...printerSource.matchAll(/const REASON_\w+: &str = "([^"]+)"/g),
    ].map((m) => m[1]);
    expect(reasons.length).toBeGreaterThanOrEqual(6);
    for (const reason of reasons) expect(printFailReason(reason)).toBe(reason);
  });

  it("표에 없는 값(Error 객체 · 다른 문구)은 고정 문구로 바꾼다", () => {
    expect(printFailReason(new Error("C:\\비밀"))).toBe(UNKNOWN_REASON);
    expect(printFailReason("박*준 1234")).toBe(UNKNOWN_REASON);
    expect(printFailReason(undefined)).toBe(UNKNOWN_REASON);
  });
});
