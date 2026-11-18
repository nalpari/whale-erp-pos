// 알림음 · 경고음을 내는 곳 (Q44: 새 주문 / 경고 두 종류).
// 소리 파일과 크기 설정(환경설정 알림음 p.18 ④)은 T06이 만든다. 지금은 호출 자리만 둔다.
export interface SoundPlayer {
  /** 새 주문 알림음. 서버가 주문받기를 자동으로 껐을 때도 한 번 울린다 (Q54). */
  playNewOrder(): void;
  /** 경고음. 인터넷이 끊겼을 때 한 번 울린다 (Q51 ①, Q44). */
  playWarning(): void;
}

/** shortcut: 소리 파일이 아직 없어 아무 소리도 내지 않는다. T06에서 실제 재생으로 바꾼다. */
export function createNoopSoundPlayer(): SoundPlayer {
  return { playNewOrder: () => {}, playWarning: () => {} };
}
