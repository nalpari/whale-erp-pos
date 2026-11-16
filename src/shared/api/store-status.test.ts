import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockStoreStatusApi } from "./store-status";

describe("createMockStoreStatusApi", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("기본 300ms 뒤 성공한다", async () => {
    const done = vi.fn();
    void createMockStoreStatusApi().setAcceptingOrders(true).then(done);

    await vi.advanceTimersByTimeAsync(299);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  it("shouldFail이 true면 실패한다", async () => {
    const api = createMockStoreStatusApi({
      delayMs: 10,
      shouldFail: (a) => !a,
    });
    const result = expect(api.setAcceptingOrders(false)).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(10);
    await result;
  });
});
