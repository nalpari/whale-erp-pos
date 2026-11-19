// 알림음 · 경고음을 내는 곳 (Q44: 새 주문 / 경고 두 종류).
// 실제 소리는 web-audio-player.ts, 크기 설정(환경설정 알림음 p.18 ④)은 T10이 만든다.
export interface SoundPlayer {
  /** 새 주문 알림음. 서버가 주문받기를 자동으로 껐을 때도 한 번 울린다 (Q54). */
  playNewOrder(): void;
  /** 경고음. 인터넷이 끊겼을 때 한 번 울린다 (Q51 ①, Q44). */
  playWarning(): void;
  /** 알림음 크기 20~100 (환경설정 위젯설정, 범위는 부르는 쪽이 맞춰 넘긴다). 두 소리에 같이 적용된다. 없는 재생기(테스트용)는 무시한다. */
  setVolume?(volume: number): void;
}

/**
 * 크기 → 소리 배율. 40이 T06의 지금 소리(1배), 20은 절반, 100은 2배이고 그 사이는 직선이다 (T10 스펙 4장).
 * 지금 소리의 최고점이 0.5라서 2배(1.0)가 스피커 한계다. 그 이상은 크게 해도 소리가 아니라 깨짐만 늘어난다.
 */
export function volumeScale(volume: number): number {
  return volume <= 40 ? volume / 40 : 1 + (volume - 40) / 60;
}

/** 리미터가 소리를 누르기 시작하는 높이. 이 아래는 소리를 그대로 둔다(크기 90까지는 그대로, 100의 한 음 최고점 1.0은 약 0.99로 살짝만 눌린다). 입력 ±4는 web-audio-player의 앞단 게인 1/4과 짝이다. */
const LIMITER_KNEE = 0.95;

/**
 * 소리가 찢어지지 않게 하는 부드러운 리미터 곡선. 0.95 아래는 그대로 두고,
 * 그 위는 1.0에 천천히 붙게 눌러서 크게 해도 1을 넘어 잘리는(깨지는) 일이 없다.
 * 입력은 -4~4를 -1~1로 줄여 넣는다 (겹친 소리 최대 2 + 여유).
 */
export function softLimitCurve(size = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = ((i / (size - 1)) * 2 - 1) * 4;
    const a = Math.abs(x);
    const y =
      a <= LIMITER_KNEE
        ? a
        : LIMITER_KNEE +
          (1 - LIMITER_KNEE) *
            Math.tanh((a - LIMITER_KNEE) / (1 - LIMITER_KNEE));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** 소리를 내지 않는 재생기. 테스트용. */
export function createNoopSoundPlayer(): SoundPlayer {
  return { playNewOrder: () => {}, playWarning: () => {} };
}

/** 접수대기 주문이 남아 있는 동안 새 주문 알림음을 되풀이하는 간격 (Q20). 운영해 보고 조정할 값이라 한 곳에 둔다. */
export const ALERT_REPEAT_MS = 30_000;
