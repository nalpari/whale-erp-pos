import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNow } from "./use-now";

const MIN = 60_000;
const at = (m: number, s: number) => new Date(2026, 10, 18, 15, m, s).getTime();

describe("useNow (간격 경계에 맞춰 갱신, 12장 A-1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(47, 30));
  });
  afterEach(() => vi.useRealTimers());

  it("15:47:30에 켜면 15:48:00에 갱신되고, 그 뒤로 1분마다", () => {
    const { result } = renderHook(() => useNow(MIN));
    expect(result.current).toBe(at(47, 30));

    act(() => void vi.advanceTimersByTime(29_999));
    expect(result.current).toBe(at(47, 30));
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(at(48, 0));

    act(() => void vi.advanceTimersByTime(MIN));
    expect(result.current).toBe(at(49, 0));
  });

  it("시계가 어긋나도(절전에서 깸 등) 다음 갱신부터 다시 분 0초에 맞춘다", () => {
    const { result } = renderHook(() => useNow(MIN));
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current).toBe(at(48, 0));

    // 이미 걸린 타이머는 그대로 1분 뒤(15:49:37)에 울리고, 그다음은 15:50:00이어야 한다.
    vi.setSystemTime(at(48, 37));
    act(() => void vi.advanceTimersByTime(MIN));
    expect(result.current).toBe(at(49, 37));
    act(() => void vi.advanceTimersByTime(23_000));
    expect(result.current).toBe(at(50, 0));
  });

  it("지우면 타이머가 남지 않는다 (첫 경계 전 · 뒤 모두)", () => {
    renderHook(() => useNow(MIN)).unmount();
    expect(vi.getTimerCount()).toBe(0);

    const h = renderHook(() => useNow(MIN));
    act(() => void vi.advanceTimersByTime(30_000));
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
