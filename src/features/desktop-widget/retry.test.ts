import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startWithRetry, WIDGET_RETRY_MAX, WIDGET_RETRY_MS } from "./retry";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("startWithRetry", () => {
  it("실패하면 간격을 두고 다시 하고, 성공하면 멈춘다", async () => {
    const attempt = vi
      .fn<() => Promise<() => void>>()
      .mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValue(() => {});
    const onGiveUp = vi.fn();
    const onRecovered = vi.fn();
    startWithRetry(attempt, { onGiveUp, onRecovered });
    await tick(0);
    expect(attempt).toHaveBeenCalledTimes(1);
    await tick(WIDGET_RETRY_MS);
    await tick(WIDGET_RETRY_MS);
    expect(attempt).toHaveBeenCalledTimes(3);
    await tick(WIDGET_RETRY_MS * 5);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(onGiveUp).not.toHaveBeenCalled();
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it("계속 실패하면 처음 + 재시도 횟수만큼만 하고 포기를 한 번 알린다", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("x"));
    const onGiveUp = vi.fn();
    startWithRetry(attempt, { onGiveUp });
    await tick(WIDGET_RETRY_MS * (WIDGET_RETRY_MAX + 3));
    expect(attempt).toHaveBeenCalledTimes(WIDGET_RETRY_MAX + 1);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it("취소하면 더 시도하지 않고, 이미 받은 연결은 정리한다", async () => {
    const stop = vi.fn();
    const attempt = vi.fn().mockResolvedValue(stop);
    const cancel = startWithRetry(attempt, { onGiveUp: vi.fn() });
    await tick(0);
    cancel();
    expect(stop).toHaveBeenCalledTimes(1);

    const failing = vi.fn().mockRejectedValue(new Error("x"));
    const cancel2 = startWithRetry(failing, { onGiveUp: vi.fn() });
    await tick(0);
    cancel2();
    await tick(WIDGET_RETRY_MS * 10);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("시도가 끝나기 전에 취소하면, 뒤늦게 성공해도 연결을 정리하고 복구를 알리지 않는다", async () => {
    let finish: (stop: () => void) => void = () => {};
    const attempt = vi.fn(
      () => new Promise<() => void>((resolve) => (finish = resolve)),
    );
    const onRecovered = vi.fn();
    const cancel = startWithRetry(attempt, { onGiveUp: vi.fn(), onRecovered });
    await tick(0); // 시도가 시작돼 아직 끝나지 않은 상태
    cancel();
    const stop = vi.fn();
    finish(stop);
    await tick(0);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it("attempt가 Promise 없이 바로 던져도 실패로 세고 다시 시도한다", async () => {
    const attempt = vi
      .fn<() => Promise<() => void>>()
      .mockImplementationOnce(() => {
        throw new Error("x");
      })
      .mockResolvedValue(() => {});
    startWithRetry(attempt, { onGiveUp: vi.fn() });
    await tick(WIDGET_RETRY_MS);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
