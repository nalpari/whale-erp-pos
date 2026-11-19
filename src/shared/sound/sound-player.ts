// 알림음 · 경고음을 내는 곳 (Q44: 새 주문 / 경고 두 종류).
// 실제 소리는 web-audio-player.ts, 크기 설정(환경설정 알림음 p.18 ④)은 T10이 만든다.
export interface SoundPlayer {
  /** 새 주문 알림음. 서버가 주문받기를 자동으로 껐을 때도 한 번 울린다 (Q54). */
  playNewOrder(): void;
  /** 경고음. 인터넷이 끊겼을 때 한 번 울린다 (Q51 ①, Q44). */
  playWarning(): void;
}

/** 소리를 내지 않는 재생기. 테스트용. */
export function createNoopSoundPlayer(): SoundPlayer {
  return { playNewOrder: () => {}, playWarning: () => {} };
}

/** 접수대기 주문이 남아 있는 동안 새 주문 알림음을 되풀이하는 간격 (Q20). 운영해 보고 조정할 값이라 한 곳에 둔다. */
export const ALERT_REPEAT_MS = 30_000;
