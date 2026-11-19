// 위젯 ↔ 본 창 연결(받기 등록)이 실패했을 때 다시 시도한다 (사용자 결정 A-2, 2026-11-19).
// 운영해 보고 조정할 값이라 상수로 둔다.
export const WIDGET_RETRY_MS = 3000;
/** 처음 시도가 실패한 뒤 다시 시도하는 횟수. 이만큼 실패하면 포기하고 점원에게 「본 화면에서 처리해 주세요」를 보인다. */
export const WIDGET_RETRY_MAX = 5;

/**
 * attempt가 실패하면 WIDGET_RETRY_MS 뒤에 다시 한다. 성공하면 attempt가 돌려준 정리 함수를 기억해 두었다가 돌려주는 취소 함수가 부른다.
 * 계속 실패하면 onGiveUp을 한 번 부른다. onRecovered는 한 번이라도 실패한 뒤 성공했을 때 부른다.
 */
export function startWithRetry(
  attempt: () => Promise<() => void>,
  { onGiveUp, onRecovered }: { onGiveUp(): void; onRecovered?(): void },
): () => void {
  let cancelled = false;
  let cleanup: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  const run = () => {
    // attempt가 Promise를 돌려주기 전에 던져도 실패로 센다.
    Promise.resolve()
      .then(attempt)
      .then(
        (stop) => {
          if (cancelled) return stop();
          cleanup = stop;
          if (failures > 0) onRecovered?.();
        },
        () => {
          if (cancelled) return;
          failures += 1;
          if (failures > WIDGET_RETRY_MAX) return onGiveUp();
          timer = setTimeout(run, WIDGET_RETRY_MS);
        },
      );
  };
  run();
  return () => {
    cancelled = true;
    clearTimeout(timer);
    cleanup?.();
  };
}
