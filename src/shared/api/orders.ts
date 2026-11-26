// 주문 수신 · 상태 변경 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (SPEC-order-sync 2 · 5장, 가정).
// 아래 응답 형태, 상태 이름, 오류 구분은 모두 가정이다. 백엔드 협의 뒤 이 파일만 바꾼다.
import { startOfDay } from "../date-days";
import { ACTION_TRANSITIONS } from "../orders/orders-state";
import type { OrderEvent } from "./order-feed";
import {
  createMockOrderHistoryApi,
  toHistoryOrder,
  type CancelInfo,
  type RemakeRecord,
} from "./order-history";
import type { StoreStatusApi } from "./store-status";

export type OrderStatus =
  | "pending" // 접수대기
  | "preparing" // 제조중
  | "ready" // 제조완료
  | "picked-up" // 픽업완료
  | "store-cancelled" // 매장취소
  | "customer-cancelled" // 고객취소
  /** 매장취소 · 고객취소(자동 취소 포함) 뒤 환불이 끝난 주문. 서버가 바꿔 주문 변경으로 알린다 — 매장 프로그램이 보내는 요청은 없다 (T22, Q66. 상태 이름은 가정). */
  | "refunded"; // 환불

/** 취소된 주문(매장취소 · 고객취소 · 환불). 처리할 주문 목록 · 위젯에서 빠지고, 주문내역에서는 「취소」 탭에 들어간다. */
export function isCancelledStatus(
  status: OrderStatus,
): status is "store-cancelled" | "customer-cancelled" | "refunded" {
  return (
    status === "store-cancelled" ||
    status === "customer-cancelled" ||
    status === "refunded"
  );
}

/** 점원이 누르는 동작. 허용되는 상태 변경은 `orders-state.ts`의 표가 정한다. */
export type OrderAction =
  "accept" | "cancel" | "complete" | "pickup" | "undo-pickup";

/**
 * 고객이 고른 픽업 값 (Q26, T04 11장 B). 값 이름은 모두 가정이다. 백엔드 요청 문서(협의 전 초안) 3.6의 예시 "20min"에 맞춰 두었다.
 * 매장은 결제 시각 + 이 값으로 픽업 예정 시각을 계산한다.
 */
export type PickupChoice =
  "now" | "5min" | "10min" | "20min" | "30min" | "40min" | "1hour-plus";

/** 고른 값이 결제 시각에 더하는 분. "1시간 이상"은 1시간으로 계산한다 (Q26). */
export const PICKUP_CHOICE_MINUTES: Readonly<Record<PickupChoice, number>> = {
  now: 0,
  "5min": 5,
  "10min": 10,
  "20min": 20,
  "30min": 30,
  "40min": 40,
  "1hour-plus": 60,
};

export interface OrderItem {
  name: string;
  quantity: number;
  options?: string[];
}

/** 상태별로 그 단계가 된 시각(ms). 아직이면 null. 요약 팝업의 처리 단계에서 지난 단계의 시:분으로 보인다 (T05 결정 B, 백엔드 요청 3.6 statusTimes 가정). */
export interface StatusTimes {
  preparingAt: number | null;
  readyAt: number | null;
  /** [완료 취소]로 되돌리면 서버가 지운다(null). */
  pickedUpAt: number | null;
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
  /** 고객이 고른 픽업 값 (Q26). 예정 시각 = paidAt + 고른 분. */
  pickupChoice: PickupChoice;
  items: OrderItem[];
  note?: string;
  /** 서버가 가려서 준다고 가정한 값 (개인정보 규칙). */
  customerName: string;
  phoneLast4: string;
  statusTimes: StatusTimes;
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
  | { kind: "customer-cancelled"; order: Order }
  /** 픽업완료 주문의 취소 시간(결제한 날 0시)이 지났다. 상태는 그대로 (T18, 거절 종류 이름은 가정 · 백엔드 협의). */
  | { kind: "too-late"; order: Order };

/** 재제조 구분 (Q62): 매장 과실(실제 클레임) / 고객 실수. 이름은 가정 · 백엔드 협의. */
export type RemakeFault = "store" | "customer";

/**
 * 다시 만들 메뉴 한 줄 (SPEC-remake 3 · 7장). 서버가 이만큼 재고를 뺀다고 가정한다.
 * itemIndex: 주문 메뉴(Order.items) 줄의 순번(0부터). 메뉴 줄 ID가 아직 없어 순번으로 가리킨다(가정, 백엔드 협의 때 바꾼다).
 */
export interface RemakeItem {
  itemIndex: number;
  /** 1 ~ 그 줄의 주문 수량. */
  quantity: number;
}

/** [재제조] 요청 (SPEC-remake 4 · 7장). 상태를 바꾸지 않고 기록만 쌓는다. 형태는 가정이다. */
export interface RemakeRequest {
  orderId: string;
  /** 하나 이상. */
  items: RemakeItem[];
  /** 고른 사유 문구 또는 직접 입력한 글. */
  reason: string;
  fault: RemakeFault;
  idempotencyKey: string;
}

/** 서버 오류 · 시간 초과 · 끊김은 예외. rejected: 취소됐거나 결제한 날 0시가 지난 픽업완료라 받지 않았다 (거절 종류 이름은 가정). */
export type RemakeResult =
  { kind: "ok"; order: Order } | { kind: "rejected"; order: Order };

export interface OrderApi {
  /** 처리할 주문 전체(접수대기 · 제조중 · 제조완료)와 오늘 픽업완료 (스펙 3.1-2). */
  fetchOrders(): Promise<Order[]>;
  /** 새 주문 수신 확인. */
  ackOrders(orderIds: string[]): Promise<void>;
  changeStatus(request: StatusChangeRequest): Promise<StatusChangeResult>;
  requestRemake(request: RemakeRequest): Promise<RemakeResult>;
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
  // 주문내역 상세가 보이는 취소 시각 · 누가 · 사유 (주문내역 SPEC 3장).
  const cancels = new Map<string, CancelInfo>();
  // 재제조 기록 (주문내역 상세 처리 이력, SPEC-remake 6장)과 그 멱등 결과.
  const remakes = new Map<string, RemakeRecord[]>();
  const remakeResults = new Map<string, RemakeResult>();
  const subscribers = new Set<{
    onEvent(e: OrderEvent): void;
    onClose(): void;
  }>();
  let connected = true;
  let accepting = false;
  let acceptingBeforeDisconnect = false;
  let orderSeq = 0;
  // 전체 삭제 뒤 픽업번호만 처음부터 다시 센다. orderId는 계속 올려, 화면 쪽에 orderId로 남은 상태(시간 초과 접수 키 등)가 같은 orderId의 새 주문에 붙지 않게 한다.
  let pickupBase = 0;
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

  // 개발용 화면 확인을 위해 값이 고르게 돌고, 세 번에 한 번은 긴 메뉴 · 옵션 · 요청사항을 넣는다.
  const PICKUP_CHOICES = Object.keys(PICKUP_CHOICE_MINUTES) as PickupChoice[];
  function newOrder(): Order {
    orderSeq += 1;
    const at = stamp();
    const long = orderSeq % 3 === 0;
    const order: Order = {
      orderId: `mock-order-${orderSeq}`,
      orderNumber: `261118000001${String(orderSeq).padStart(4, "0")}`,
      pickupNumber: orderSeq - pickupBase,
      status: "pending",
      updatedAt: at,
      paidAt: at,
      pickupChoice: PICKUP_CHOICES[(orderSeq - 1) % PICKUP_CHOICES.length],
      items: long
        ? [
            {
              name: "아이스 아메리카노(시험)",
              quantity: 2,
              options: [
                "샷 추가",
                "시럽 빼기",
                "얼음 적게",
                "컵 두 개로 나눠 담기",
              ],
            },
            { name: "카페라떼(시험)", quantity: 1 },
            { name: "딸기 스무디(시험)", quantity: 1 },
            { name: "치즈 케이크(시험)", quantity: 1 },
            { name: "초코 쿠키(시험)", quantity: 3 },
          ]
        : [{ name: "아이스 아메리카노(시험)", quantity: 1 }],
      note: long
        ? "얼음 조금만 넣어 주세요. 빨대는 필요 없습니다. 케이크는 따로 포장해 주세요."
        : undefined,
      customerName: "홍*동",
      phoneLast4: "0000",
      statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
    };
    orders.set(order.orderId, order);
    return order;
  }

  function oldestPending(): Order | undefined {
    return [...orders.values()].find((o) => o.status === "pending");
  }
  function update(
    order: Order,
    status: Order["status"],
    reason?: string,
  ): Order {
    const at = stamp();
    if (status === "refunded") {
      const cancel = cancels.get(order.orderId);
      if (cancel) cancels.set(order.orderId, { ...cancel, refundedAt: at });
    } else if (isCancelledStatus(status)) {
      cancels.set(order.orderId, {
        at,
        by: status === "store-cancelled" ? "store" : "customer",
        reason: reason ?? null,
      });
    }
    const t = order.statusTimes;
    const statusTimes = {
      preparingAt: status === "preparing" ? at : t.preparingAt,
      // 완료 취소로 제조완료에 돌아와도 처음 제조완료가 된 시각을 지키지 않고 덮어쓰면 단계 시각이 거짓이 된다.
      readyAt: status === "ready" && t.readyAt === null ? at : t.readyAt,
      // 픽업완료에서 되돌아가면(제조완료) 지운다. 취소 같은 다른 변경은 그대로 둔다.
      pickedUpAt:
        status === "picked-up" ? at : status === "ready" ? null : t.pickedUpAt,
    };
    const next = { ...order, status, updatedAt: at, statusTimes };
    orders.set(next.orderId, next);
    emit({ eventId: nextEventId(), type: "order-updated", order: next });
    return next;
  }

  const api: OrderApi = {
    async fetchOrders() {
      await guard();
      return [...orders.values()].filter((o) => !isCancelledStatus(o.status));
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
        request.action === "cancel" &&
        order.status === "picked-up" &&
        order.paidAt < startOfDay(Date.now())
      ) {
        // 가정: 서버가 결제한 날 0시가 지난 픽업완료 취소를 거절한다 (T18).
        result = { kind: "too-late", order };
      } else if (
        !ACTION_TRANSITIONS[request.action].from.includes(order.status)
      ) {
        result = { kind: "already-handled", order };
      } else {
        const next = update(
          order,
          ACTION_TRANSITIONS[request.action].to,
          request.reason,
        );
        result = { kind: "ok", order: next };
      }
      results.set(request.idempotencyKey, result);
      return result;
    },
    async requestRemake(request) {
      await guard();
      const cached = remakeResults.get(request.idempotencyKey);
      if (cached) return cached;
      const order = orders.get(request.orderId);
      if (!order) throw new Error("모의 서버: 없는 주문");
      // 가정: 서버는 주문에 있는 줄 · 주문 수량 안의 수량만 받는다. 어긋나면 화면 버그라 오류로 본다(입력값은 문구에 넣지 않는다).
      const itemsValid =
        request.items.length > 0 &&
        // 같은 줄이 두 번 오면 합계가 주문 수량을 넘을 수 있다.
        new Set(request.items.map((i) => i.itemIndex)).size ===
          request.items.length &&
        request.items.every(
          (i) =>
            Number.isInteger(i.quantity) &&
            i.quantity >= 1 &&
            i.quantity <= (order.items[i.itemIndex]?.quantity ?? 0),
        );
      if (!itemsValid) throw new Error("모의 서버: 잘못된 재제조 메뉴");
      // 가정: 서버는 제조완료와 결제한 날 0시 전의 픽업완료만 받는다 (SPEC-remake 2 · 5장).
      const allowed =
        order.status === "ready" ||
        (order.status === "picked-up" &&
          order.paidAt >= startOfDay(Date.now()));
      let result: RemakeResult;
      if (allowed) {
        const list = remakes.get(order.orderId) ?? [];
        list.push({
          at: stamp(),
          items: request.items.map((i) => ({ ...i })),
          reason: request.reason,
          fault: request.fault,
        });
        remakes.set(order.orderId, list);
        result = { kind: "ok", order };
      } else {
        result = { kind: "rejected", order };
      }
      remakeResults.set(request.idempotencyKey, result);
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

  const historyApi = createMockOrderHistoryApi({
    todayOrders: () =>
      [...orders.values()].map((o) =>
        toHistoryOrder(
          o,
          cancels.get(o.orderId) ?? null,
          remakes.get(o.orderId) ?? [],
        ),
      ),
    delayMs,
    isConnected: () => connected,
  });

  return {
    api,
    storeStatusApi,
    /** 주문내역 조회. 오늘 주문은 이 모의 서버의 주문과 같다. */
    historyApi,
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
      /** 주문 하나를 고객이 취소한다 (접수대기가 아닌 주문의 경로 확인용). */
      customerCancels(orderId: string) {
        const order = orders.get(orderId);
        if (order) update(order, "customer-cancelled");
      },
      /** 가장 오래된 접수대기 주문을 고객이 취소한다. */
      customerCancelsOldestPending() {
        const order = oldestPending();
        if (order) update(order, "customer-cancelled");
      },
      /** 가장 최근에 취소된(아직 환불 전) 주문의 환불이 끝난다 (T22). */
      refundLatestCancelled() {
        const latest = [...cancels.entries()]
          .filter(([id]) => {
            const status = orders.get(id)?.status;
            return (
              status === "store-cancelled" || status === "customer-cancelled"
            );
          })
          .sort(([, a], [, b]) => b.at - a.at)[0];
        const order = latest && orders.get(latest[0]);
        if (order) update(order, "refunded");
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
      /**
       * 개발용: 서버의 주문을 전부 지운다(오늘 픽업완료 · 취소 포함). 처음 상태에서 다시 시험하려는 용도다.
       * 픽업번호는 처음(#1)부터 다시 센다. 멱등 결과와 「같은 주문 다시 보내기」 대상도 비우고, 주문받기 상태는 그대로 둔다.
       */
      deleteAllOrders() {
        orders.clear();
        results.clear();
        cancels.clear();
        remakes.clear();
        remakeResults.clear();
        lastCreated = null;
        pickupBase = orderSeq;
        emit({ eventId: nextEventId(), type: "orders-cleared" });
      },
    },
  };
}

export type MockOrderBackend = ReturnType<typeof createMockOrderBackend>;
