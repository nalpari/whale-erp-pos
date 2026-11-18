// 주문 수신 · 상태 변경 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (SPEC-order-sync 2 · 5장, 가정).
// 아래 응답 형태, 상태 이름, 오류 구분은 모두 가정이다. 백엔드 협의 뒤 이 파일만 바꾼다.
import { ACTION_TRANSITIONS } from "../orders/orders-state";
import type { OrderEvent } from "./order-feed";
import type { StoreStatusApi } from "./store-status";

export type OrderStatus =
  | "pending" // 접수대기
  | "preparing" // 제조중
  | "ready" // 제조완료
  | "picked-up" // 픽업완료
  | "store-cancelled" // 매장취소
  | "customer-cancelled"; // 고객취소

/** 점원이 누르는 동작. 허용되는 상태 변경은 `orders-state.ts`의 표가 정한다. */
export type OrderAction =
  "accept" | "cancel" | "complete" | "pickup" | "undo-pickup";

export interface OrderItem {
  name: string;
  quantity: number;
  options?: string[];
}

export interface Order {
  /** 서버가 정한 식별자. 로그에는 이것만 남긴다. */
  orderId: string;
  /** 16자리: YYMMDD + 점포코드 숫자 6자리 + 그날 일련번호 4자리 (Q28). */
  orderNumber: string;
  /** 점포별 매일 1부터 (Q25). */
  pickupNumber: number;
  status: OrderStatus;
  /** 마지막 변경 시각(ms). 순서가 바뀐 이벤트를 거르는 기준이다. */
  updatedAt: number;
  paidAt: number;
  /** 고객이 고른 픽업 예정 시각 (Q26). */
  pickupAt: number;
  items: OrderItem[];
  note?: string;
  /** 서버가 가려서 준다고 가정한 값 (개인정보 규칙). */
  customerName: string;
  phoneLast4: string;
}

export interface StatusChangeRequest {
  orderId: string;
  action: OrderAction;
  /** [주문취소] 사유. */
  reason?: string;
  /** 같은 누름을 다시 보내도 서버가 한 번만 처리하게 하는 키 (스펙 3.3-1). */
  idempotencyKey: string;
}

/** 서버 오류 · 시간 초과 · 끊김은 응답이 아니라 예외로 나타낸다. */
export type StatusChangeResult =
  | { kind: "ok"; order: Order }
  /** 다른 PC가 먼저 처리했다. order는 서버의 최신 상태. */
  | { kind: "already-handled"; order: Order }
  | { kind: "customer-cancelled"; order: Order };

export interface OrderApi {
  /** 처리할 주문 전체(접수대기 · 제조중 · 제조완료)와 오늘 픽업완료 (스펙 3.1-2). */
  fetchOrders(): Promise<Order[]>;
  /** 새 주문 수신 확인. */
  ackOrders(orderIds: string[]): Promise<void>;
  changeStatus(request: StatusChangeRequest): Promise<StatusChangeResult>;
  /** 연결 신호 (15초마다, 스펙 3.4). */
  sendHeartbeat(): Promise<void>;
  /** 서버가 가진 점포의 주문받기 상태. */
  getAcceptingOrders(): Promise<boolean>;
}

export interface MockOrderBackendOptions {
  /** 응답까지 걸리는 시간. 0이면 타이머 없이 바로 응답한다 (테스트). 기본 300ms. */
  delayMs?: number;
}

/**
 * 가정: 서버 한 대의 동작을 한 곳에 모은 모의 구현. 모의 API · 실시간 연결 · 개발용 버튼이 같은 상태를 본다.
 * 주문 데이터는 시험용 값이다 (실제 고객 · 점포 정보 아님).
 * - 끊기면(`setConnected(false)`) 요청이 실패하고, 서버가 주문받기를 끄며, 이어지면 직전 상태로 되돌린다 (11장 I).
 * - 끊긴 동안 생긴 주문은 서버가 보관한다 (Q53).
 */
export function createMockOrderBackend(options: MockOrderBackendOptions = {}) {
  const { delayMs = 300 } = options;
  const orders = new Map<string, Order>();
  const results = new Map<string, StatusChangeResult>();
  const subscribers = new Set<{
    onEvent(e: OrderEvent): void;
    onClose(): void;
  }>();
  let connected = true;
  let accepting = false;
  let acceptingBeforeDisconnect = false;
  let orderSeq = 0;
  let eventSeq = 0;
  let lastTimestamp = 0;
  let lastCreated: Order | null = null;

  const wait = () =>
    delayMs > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, delayMs))
      : Promise.resolve();
  async function guard() {
    await wait();
    if (!connected) throw new Error("모의 서버 연결 끊김");
  }
  // updatedAt은 반드시 증가해야 순서 거르기를 흉내 낼 수 있다.
  function stamp(): number {
    lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
    return lastTimestamp;
  }
  function emit(event: OrderEvent) {
    subscribers.forEach((s) => s.onEvent(event));
  }
  const nextEventId = () => `mock-event-${++eventSeq}`;

  function newOrder(): Order {
    orderSeq += 1;
    const at = stamp();
    const order: Order = {
      orderId: `mock-order-${orderSeq}`,
      orderNumber: `261118000001${String(orderSeq).padStart(4, "0")}`,
      pickupNumber: orderSeq,
      status: "pending",
      updatedAt: at,
      paidAt: at,
      pickupAt: at + 10 * 60_000,
      items: [{ name: "아이스 아메리카노(시험)", quantity: 1 }],
      customerName: "홍*동",
      phoneLast4: "0000",
    };
    orders.set(order.orderId, order);
    return order;
  }

  function oldestPending(): Order | undefined {
    return [...orders.values()].find((o) => o.status === "pending");
  }
  function update(order: Order, status: Order["status"]): Order {
    const next = { ...order, status, updatedAt: stamp() };
    orders.set(next.orderId, next);
    emit({ eventId: nextEventId(), type: "order-updated", order: next });
    return next;
  }

  const api: OrderApi = {
    async fetchOrders() {
      await guard();
      return [...orders.values()].filter(
        (o) =>
          o.status !== "store-cancelled" && o.status !== "customer-cancelled",
      );
    },
    async ackOrders() {
      await guard();
    },
    async sendHeartbeat() {
      await guard();
    },
    async getAcceptingOrders() {
      await guard();
      return accepting;
    },
    async changeStatus(request) {
      await guard();
      const cached = results.get(request.idempotencyKey);
      if (cached) return cached;
      const order = orders.get(request.orderId);
      if (!order) throw new Error("모의 서버: 없는 주문");
      let result: StatusChangeResult;
      if (order.status === "customer-cancelled") {
        result = { kind: "customer-cancelled", order };
      } else if (
        !ACTION_TRANSITIONS[request.action].from.includes(order.status)
      ) {
        result = { kind: "already-handled", order };
      } else {
        const next = update(order, ACTION_TRANSITIONS[request.action].to);
        result = { kind: "ok", order: next };
      }
      results.set(request.idempotencyKey, result);
      return result;
    },
  };

  const storeStatusApi: StoreStatusApi = {
    async setAcceptingOrders(next) {
      await guard();
      accepting = next;
    },
  };

  function setConnected(next: boolean) {
    if (next === connected) return;
    connected = next;
    if (!next) {
      acceptingBeforeDisconnect = accepting;
      accepting = false; // 서버가 1분 뒤 「준비중」으로 바꾸는 것을 바로 흉내 낸다 (Q53)
      const closing = [...subscribers];
      subscribers.clear();
      closing.forEach((s) => s.onClose());
    } else {
      accepting = acceptingBeforeDisconnect; // 앱은 받은 상태를 반영만 한다 (11장 I)
    }
  }

  return {
    api,
    storeStatusApi,
    /** 실시간 연결. 끊긴 상태면 던진다. 돌려주는 함수가 연결을 닫는다. */
    subscribe(onEvent: (e: OrderEvent) => void, onClose: () => void) {
      if (!connected) throw new Error("모의 서버 연결 끊김");
      const subscriber = { onEvent, onClose };
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    /** 개발용 버튼과 테스트가 서버 쪽 사건을 만든다. */
    dev: {
      addOrders(count: number) {
        for (let i = 0; i < count; i += 1) {
          const order = newOrder();
          lastCreated = order;
          emit({ eventId: nextEventId(), type: "order-created", order });
        }
      },
      /** 가장 오래된 접수대기 주문을 고객이 취소한다. */
      customerCancelsOldestPending() {
        const order = oldestPending();
        if (order) update(order, "customer-cancelled");
      },
      /** 가장 오래된 접수대기 주문을 다른 PC가 접수한다. */
      otherPcAcceptsOldestPending() {
        const order = oldestPending();
        if (order) update(order, "preparing");
      },
      setConnected,
      isConnected: () => connected,
      /** 미접수 자동 취소 연속 2건으로 서버가 주문받기를 끈다 (Q54). */
      triggerAutoOff() {
        accepting = false;
        emit({
          eventId: nextEventId(),
          type: "accepting-changed",
          accepting: false,
          reason: "auto-cancel-streak",
        });
      },
      /** 같은 주문 · 같은 사건을 다시 보낸다 (중복 확인용). */
      resendLastOrder() {
        if (lastCreated) {
          emit({
            eventId: `mock-event-resend-${lastCreated.orderId}`,
            type: "order-created",
            order: lastCreated,
          });
        }
      },
      isAccepting: () => accepting,
    },
  };
}

export type MockOrderBackend = ReturnType<typeof createMockOrderBackend>;
