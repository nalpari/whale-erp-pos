import { describe, expect, it, vi } from "vitest";
import * as logModule from "../log/log";
import { createWebAudioSoundPlayer } from "./web-audio-player";

// 소리를 실제로 내지 않고 어떤 음을 언제 시작하는지만 기록하는 가짜 AudioContext.
function fakeContext() {
  const tones: Array<{ frequency: number; start: number }> = [];
  const ctx = {
    currentTime: 10,
    state: "running",
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
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
  return { ctx: ctx as unknown as AudioContext, tones, resume: ctx.resume };
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
});
