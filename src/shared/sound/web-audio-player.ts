// 브라우저 기본 기능(Web Audio)으로 알림음을 코드로 만든다 (T06 스펙 11장 A). 소리 파일이 생기면 이 파일만 바꾼다.
// 크기는 100% 고정이다 (11장 B, 크기 설정은 T10).
import { logInfo } from "../log/log";
import { logMessages } from "../log/log-messages";
import type { SoundPlayer } from "./sound-player";

interface Tone {
  frequency: number;
  /** 소리 시작 시각(초, 지금부터). */
  at: number;
  length: number;
  wave: OscillatorType;
}

// 새 주문은 높은 음 → 낮은 음 「딩동」, 경고는 낮은 음 세 번 (Q44: 둘이 달라야 한다).
const NEW_ORDER: Tone[] = [
  { frequency: 1318.5, at: 0, length: 0.35, wave: "sine" },
  { frequency: 987.8, at: 0.3, length: 0.7, wave: "sine" },
];
const WARNING: Tone[] = [0, 0.4, 0.8].map((at) => ({
  frequency: 220,
  at,
  length: 0.25,
  wave: "square",
}));

export function createWebAudioSoundPlayer(
  createContext: () => AudioContext = () => new AudioContext(),
): SoundPlayer {
  let ctx: AudioContext | null = null;

  // 자동 로그인으로 켜져 한 번도 누르지 않았다면 브라우저가 소리를 막는다. 첫 터치 · 키 입력 때 미리 깨워 둔다.
  if (typeof document !== "undefined") {
    const unlock = () => {
      try {
        ctx ??= createContext();
        void ctx.resume().catch(() => {});
      } catch {
        // 재생기를 못 만들면 실제로 울릴 때 로그가 남는다.
      }
    };
    document.addEventListener("pointerdown", unlock, {
      once: true,
      capture: true,
    });
    document.addEventListener("keydown", unlock, { once: true, capture: true });
  }

  function play(tones: Tone[], kind: "new-order" | "warning") {
    try {
      ctx ??= createContext();
      // 사용자가 화면을 누르기 전에는 브라우저가 소리를 막아 두므로 깨운다.
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => void logInfo(logMessages.soundFailed(kind)));
      }
      const now = ctx.currentTime;
      for (const tone of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.wave;
        osc.frequency.value = tone.frequency;
        // 시작은 짧게 올리고 끝은 줄여 "딱" 하는 잡음이 나지 않게 한다. 두 음이 겹쳐도 찢어지지 않게 최고 크기를 0.5로 둔다.
        gain.gain.setValueAtTime(0.001, now + tone.at);
        gain.gain.exponentialRampToValueAtTime(0.5, now + tone.at + 0.01);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          now + tone.at + tone.length,
        );
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + tone.at);
        osc.stop(now + tone.at + tone.length);
      }
      // 아직 깨어나지 못했다면(첫 터치 전) 소리가 안 났을 수 있다. 로그로 남겨 두어 "소리가 안 나요" 문의 때 원인을 안다.
      if (ctx.state !== "running") void logInfo(logMessages.soundBlocked());
    } catch {
      // 소리가 안 나도 주문 처리는 계속돼야 한다. 로그에는 어떤 소리가 실패했는지만 남긴다.
      void logInfo(logMessages.soundFailed(kind));
    }
  }

  return {
    playNewOrder: () => play(NEW_ORDER, "new-order"),
    playWarning: () => play(WARNING, "warning"),
  };
}
