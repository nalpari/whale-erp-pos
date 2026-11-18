// 모든 서버 요청에 씌우는 시간 제한 (SPEC-order-sync 3.6, 사용자 결정 C-1).

export const REQUEST_TIMEOUT_MS = 10_000;

/** 제한 시간 안에 응답이 없을 때. 일반 네트워크 오류와 같이 "실패"로 다루되 로그에서 가려 보려고 따로 둔다. */
export class RequestTimeoutError extends Error {
  constructor() {
    super("서버 응답 시간 초과");
    this.name = "RequestTimeoutError";
  }
}

/**
 * 요청이 10초 안에 끝나지 않으면 실패로 돌린다. 늦게 온 응답은 버려지지만 서버에서는 처리됐을 수 있다
 * (요청 자체를 취소하지는 못한다). 상태 변경은 점원이 다시 누르면 같은 멱등키로 보내
 * 서버가 한 번만 처리하게 한다 (order-sync.ts).
 */
export function withTimeout<T>(
  request: Promise<T>,
  ms: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RequestTimeoutError()), ms);
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
