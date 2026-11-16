// 점포 주문 받기 상태 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (스펙 3장, 가정).
export interface StoreStatusApi {
  /** 점포의 주문 받기 상태를 바꾼다. 실패하면 예외를 던진다. */
  setAcceptingOrders(accepting: boolean): Promise<void>;
}

export interface MockStoreStatusOptions {
  /** 응답까지 걸리는 시간. 기본 300ms (스펙 3장). */
  delayMs?: number;
  /** true를 돌려주면 그 요청을 실패시킨다. 테스트에서 실패를 만들 때 쓴다. */
  shouldFail?: (accepting: boolean) => boolean;
}

/** 가정: 실제 서버 응답 형식이 정해지지 않아, 성공은 값 없이 끝나고 실패는 예외로만 나타낸다. */
export function createMockStoreStatusApi(
  options: MockStoreStatusOptions = {},
): StoreStatusApi {
  const { delayMs = 300, shouldFail = () => false } = options;
  return {
    setAcceptingOrders(accepting) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          if (shouldFail(accepting)) {
            reject(new Error("모의 서버 요청 실패"));
          } else {
            resolve();
          }
        }, delayMs);
      });
    },
  };
}
