import { describe, expect, it, vi, type Mock } from "vitest";
import * as logModule from "../log/log";
import { createWebAudioSoundPlayer } from "./web-audio-player";

// 소리를 실제로 내지 않고 어떤 음을 언제 시작하는지만 기록하는 가짜 AudioContext.
function fakeContext() {
  const tones: Array<{ frequency: number; start: number }> = [];
  const peaks: number[] = [];
  const shapers: Array<{ curve: Float32Array | null; connect: Mock }> = [];
  const gains: Array<{ gain: { value: number }; connect: Mock }> = [];
  const ctx = {
    currentTime: 10,
    state: "running",
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createWaveShaper: () => {
      const shaper = {
        curve: null as Float32Array | null,
        oversample: "none",
        connect: vi.fn(),
      };
      shapers.push(shaper);
      return shaper;
    },
    createGain: () => {
      const node = {
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn((v: number) => {
            if (v > 0.01) peaks.push(v);
          }),
        },
        connect: vi.fn(),
      };
      gains.push(node);
      return node;
    },
    createOscillator: () => {
      const tone = { frequency: 0, start: 0 };
      tones.push(tone);
      return {
        type: "sine",
        frequency: {
          set value(v: number) {
            tone.frequency = v;
          },
        },
        connect: vi.fn(),
        start: (t: number) => {
          tone.start = t;
        },
        stop: vi.fn(),
      };
    },
  };
  return {
    ctx: ctx as unknown as AudioContext,
    tones,
    peaks,
    shapers,
    gains,
    destination: ctx.destination,
    resume: ctx.resume,
  };
}

describe("createWebAudioSoundPlayer", () => {
  it("새 주문은 높은 음에서 낮은 음으로 두 음(딩동)을 낸다", () => {
    const { ctx, tones } = fakeContext();
    createWebAudioSoundPlayer(() => ctx).playNewOrder();
    expect(tones).toHaveLength(2);
    expect(tones[0].frequency).toBeGreaterThan(tones[1].frequency);
    expect(tones[1].start).toBeGreaterThan(tones[0].start);
  });

  it("경고는 같은 낮은 음을 세 번 내서 새 주문 소리와 다르게 들린다", () => {
    const { ctx, tones } = fakeContext();
    const player = createWebAudioSoundPlayer(() => ctx);
    player.playWarning();
    expect(tones).toHaveLength(3);
    expect(new Set(tones.map((t) => t.frequency)).size).toBe(1);
    expect(tones[0].frequency).toBeLessThan(500);
  });

  it("멈춰 있는 재생기는 깨우고, 재생기를 못 만들면 던지지 않는다", () => {
    const { ctx, resume } = fakeContext();
    Object.defineProperty(ctx, "state", { value: "suspended" });
    createWebAudioSoundPlayer(() => ctx).playNewOrder();
    expect(resume).toHaveBeenCalled();
    const broken = createWebAudioSoundPlayer(() => {
      throw new Error("no audio");
    });
    expect(() => broken.playNewOrder()).not.toThrow();
  });

  it("재생기는 한 번만 만든다 (며칠 켜 두어도 쌓이지 않게)", () => {
    const { ctx } = fakeContext();
    const create = vi.fn(() => ctx);
    const player = createWebAudioSoundPlayer(create);
    player.playNewOrder();
    player.playNewOrder();
    player.playWarning();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("재생기를 못 만들면 어떤 소리가 실패했는지 로그를 남긴다", () => {
    const logged = vi.spyOn(logModule, "logInfo").mockResolvedValue();
    createWebAudioSoundPlayer(() => {
      throw new Error("no audio");
    }).playWarning();
    expect(logged).toHaveBeenCalledWith("경고 알림음 재생 실패");
    logged.mockRestore();
  });

  it("크기 40이 지금 소리(0.5)이고 100은 2배, 20은 절반이다", () => {
    const { ctx, peaks } = fakeContext();
    const player = createWebAudioSoundPlayer(() => ctx);
    for (const [v, peak] of [
      [40, 0.5],
      [100, 1.0],
      [20, 0.25],
      [80, 0.5 * (1 + 40 / 60)],
    ]) {
      peaks.length = 0;
      player.setVolume?.(v);
      player.playWarning();
      expect(peaks[0]).toBeCloseTo(peak);
    }
  });

  it("크기 값이 범위 밖이거나 숫자가 아니어도 소리가 나도록 20~100으로 맞춘다", () => {
    const { ctx, peaks } = fakeContext();
    const player = createWebAudioSoundPlayer(() => ctx);
    for (const [v, peak] of [
      [0, 0.25],
      [150, 1.0],
      [Number.NaN, 0.5],
    ]) {
      peaks.length = 0;
      player.setVolume?.(v);
      player.playWarning();
      expect(peaks[0]).toBeCloseTo(peak);
    }
  });

  it("모든 음은 앞단 게인(1/4) → 리미터 → 스피커 순서로 나가고, 두 번 재생해도 리미터는 하나다", () => {
    const { ctx, shapers, gains, destination } = fakeContext();
    const player = createWebAudioSoundPlayer(() => ctx);
    player.setVolume?.(100);
    player.playNewOrder();
    player.playWarning();
    const [pre, ...toneGains] = gains;
    expect(shapers).toHaveLength(1);
    expect(shapers[0].curve).not.toBeNull();
    expect(pre.gain.value).toBe(0.25);
    expect(pre.connect).toHaveBeenCalledWith(shapers[0]);
    expect(shapers[0].connect).toHaveBeenCalledWith(destination);
    expect(toneGains).toHaveLength(5);
    for (const g of toneGains) expect(g.connect).toHaveBeenCalledWith(pre);
  });

  it("리미터를 못 만들어도 알림음은 스피커로 바로 나가고 로그를 남긴다", () => {
    const logged = vi.spyOn(logModule, "logInfo").mockResolvedValue();
    const { ctx, tones, gains, destination } = fakeContext();
    (ctx as unknown as { createWaveShaper: () => never }).createWaveShaper =
      () => {
        throw new Error("no shaper");
      };
    createWebAudioSoundPlayer(() => ctx).playNewOrder();
    expect(tones).toHaveLength(2);
    expect(gains[gains.length - 1].connect).toHaveBeenCalledWith(destination);
    expect(logged).toHaveBeenCalledWith(
      "알림음 리미터 만들기 실패(리미터 없이 재생)",
    );
    logged.mockRestore();
  });
});
