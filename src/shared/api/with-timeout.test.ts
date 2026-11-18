import { afterEach, describe, expect, it, vi } from "vitest";
import {
  REQUEST_TIMEOUT_MS,
  RequestTimeoutError,
  withTimeout,
} from "./with-timeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("제한 시간은 10초다 (스펙 3.6)", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it("시간 안에 끝나면 결과를 그대로 돌려준다", async () => {
    await expect(withTimeout(Promise.resolve(42))).resolves.toBe(42);
  });

  it("시간 안에 실패하면 그 오류를 그대로 던진다", async () => {
    const error = new Error("서버 오류");
    await expect(withTimeout(Promise.reject(error))).rejects.toBe(error);
  });

  it("10초 안에 응답이 없으면 RequestTimeoutError로 실패한다", async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<never>(() => {}));
    const assertion =
      expect(result).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(9_999);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("끝나면 타이머를 남기지 않는다", async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1));
    expect(vi.getTimerCount()).toBe(0);
  });
});
