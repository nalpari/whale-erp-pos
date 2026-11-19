import { describe, expect, it } from "vitest";
import { softLimitCurve, volumeScale } from "./sound-player";

describe("알림음 크기 계산", () => {
  it("20은 절반, 40은 지금 소리, 100은 2배이고 단계마다 커진다", () => {
    expect(volumeScale(40)).toBe(1);
    expect(volumeScale(100)).toBe(2);
    const steps = [20, 30, 40, 50, 60, 70, 80, 90, 100].map(volumeScale);
    steps.slice(1).forEach((v, i) => expect(v).toBeGreaterThan(steps[i]));
    expect(volumeScale(20)).toBe(0.5);
  });

  it("리미터는 0.95 이하를 그대로 두고, 겹친 큰 소리도 1을 넘지 않으며, 커질수록 커진다", () => {
    const curve = softLimitCurve();
    const at = (x: number) => curve[Math.round(((x / 4 + 1) / 2) * 4096)];
    expect(at(0.5)).toBeCloseTo(0.5, 3);
    expect(at(0.9)).toBeCloseTo(0.9, 3);
    // 리미터를 거친 뒤에도 80 < 90 < 100이 서로 다르다 (한 음 최고점 = 0.5 × 배율).
    const peak = (v: number) => at(0.5 * volumeScale(v));
    expect(peak(80)).toBeLessThan(peak(90));
    expect(peak(90)).toBeLessThan(peak(100));
    expect(peak(100)).toBeGreaterThan(0.98);
    expect(at(0.25)).toBeCloseTo(0.25, 3);
    expect(at(-0.4)).toBeCloseTo(-0.4, 3);
    expect(at(1.25)).toBeGreaterThan(at(0.5));
    expect(at(2.5)).toBeGreaterThan(at(1.25));
    expect(Math.max(...curve)).toBeLessThanOrEqual(1);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-1);
  });
});
