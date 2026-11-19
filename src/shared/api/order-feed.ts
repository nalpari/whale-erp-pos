// 실시간 사건 수신 인터페이스 (SPEC-order-sync 3.1-3, 5장).
// 실제 전달 방식(WebSocket / SSE / 롱 폴링 / MQTT 등)은 백엔드 PL 회의 뒤에 정한다.
// 정해지면 이 파일에 구현을 추가하고 App.tsx에서 바꿔 끼운다. 나머지 코드는 이 인터페이스만 안다.
import type { MockOrderBackend, Order } from "./orders";

/** 서버가 보내는 사건 (가정). eventId는 같은 사건이 두 번 와도 한 번만 처리하려는 기준이다. */
export type OrderEvent =
  | { eventId: string; type: "order-created"; order: Order }
  | { eventId: string; type: "order-updated"; order: Order }
  /** 개발용 모의 서버가 주문을 전부 지웠다. 화면이 가진 주문도 비운다. 실제 서버는 보내지 않는다. */
  | { eventId: string; type: "orders-cleared" }
  | {
      eventId: string;
      type: "accepting-changed";
      accepting: boolean;
      /** 미접수 자동 취소 연속 2건으로 서버가 끈 경우 (Q54). */
      reason?: "auto-cancel-streak";
    };

export interface OrderFeedHandlers {
  onEvent(event: OrderEvent): void;
  /** 연결이 끊겼을 때. 다시 연결은 호출한 쪽이 `connect`를 다시 불러 한다. */
  onClose(): void;
}

export interface OrderFeed {
  /** 연결을 열고 사건을 받기 시작한다. 연결하지 못하면 거절한다. 돌려주는 함수로 연결을 닫는다. */
  connect(handlers: OrderFeedHandlers): Promise<() => void>;
}

/** 가정: 모의 서버(`createMockOrderBackend`)의 사건을 그대로 넘겨 주는 구현. */
export function createMockOrderFeed(
  backend: Pick<MockOrderBackend, "subscribe">,
): OrderFeed {
  return {
    connect: async (handlers) =>
      backend.subscribe(handlers.onEvent, handlers.onClose),
  };
}
