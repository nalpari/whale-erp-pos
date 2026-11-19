// 인쇄 작업을 넘긴 뒤 이 시간 안에 끝나지 않으면 「출력 결과를 확인할 수 없습니다.」로 본다 (T12 스펙 5장, 사용자 결정 2026-11-19).
export const PRINT_TIMEOUT_MS = 30_000;

export class PrintTimeoutError extends Error {
  constructor() {
    super("print timeout");
    this.name = "PrintTimeoutError";
  }
}

/**
 * 시간 안에 끝나지 않으면 PrintTimeoutError로 reject한다. 뒤늦게 Rust 쪽 출력이 끝나도 결과는 무시하고
 * onLate로 로그만 남기게 한다: 이미 실패로 알렸는데 나중에 성공으로 되돌리면 점원이 헷갈린다.
 */
export function withPrintTimeout(
  job: Promise<void>,
  onLate: (ok: boolean) => void,
  ms = PRINT_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new PrintTimeoutError());
    }, ms);
    job.then(
      () => {
        clearTimeout(timer);
        if (timedOut) onLate(true);
        else resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        if (timedOut) onLate(false);
        else reject(error);
      },
    );
  });
}
