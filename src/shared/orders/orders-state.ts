// 주문 목록의 순수 함수 모음 (SPEC-order-sync 2.1 · 3.2 · 5장). 시간 · 서버 · 화면을 모른다.
import {
  isCancelledStatus,
  type Order,
  type OrderAction,
  type OrderStatus,
} from "../api/orders";

/** orderId · eventId를 기억하는 개수. 며칠 켜 두어도 메모리가 늘지 않게 최근 것만 둔다 (스펙 3.2-2). */
export const SEEN_LIMIT = 1000;
/** [픽업완료] 뒤 [완료 취소]를 받는 시간 (Q22, 11장 F). */
export const UNDO_WINDOW_MS = 5000;

/** 스펙 2.1의 상태 변경 표. 이 표에 없는 변경 요청은 보내지 않는다. */
export const ACTION_TRANSITIONS: Record<
  OrderAction,
  { from: OrderStatus[]; to: OrderStatus }
> = {
  accept: { from: ["pending"], to: "preparing" },
  // 제조완료 · 픽업완료에서도 취소한다 (T18). 픽업완료는 결제한 날 0시 전까지만이고, 그 판단은 서버(화면은 버튼만 숨김).
  cancel: {
    from: ["pending", "preparing", "ready", "picked-up"],
    to: "store-cancelled",
  },
  complete: { from: ["preparing"], to: "ready" },
  pickup: { from: ["ready"], to: "picked-up" },
  "undo-pickup": { from: ["picked-up"], to: "ready" },
};

const PENDING_STATUSES: OrderStatus[] = ["pending", "preparing", "ready"];

export function canApplyAction(
  status: OrderStatus,
  action: OrderAction,
): boolean {
  return ACTION_TRANSITIONS[action].from.includes(status);
}

export interface OrdersState {
  orders: Record<string, Order>;
  /** 주문을 마지막으로 바꾼 때의 `seq`. 전체 조회가 "조회 도중 들어온 주문"을 지우지 않게 하는 기준이다. */
  touched: Record<string, number>;
  seq: number;
  /** 이미 본 orderId (최근 1,000개). 새 주문 신호를 한 번만 내려는 기준. */
  seenOrderIds: string[];
  /** 요청이 진행 중인 주문 (두 번 누름 방지, 화면의 "요청 중" 표시). */
  inFlight: Record<string, true>;
  /** [픽업완료]에 성공한 시각. 5초 안 [완료 취소]를 받는 기준. */
  pickedUpAt: Record<string, number>;
  /** 마지막 액션으로 "새 주문 신호"를 내야 하는 orderId. 주문을 합치는 액션(loaded · received)이 새로 쓰고, 그 밖의 액션은 비운다. */
  lastNew: string[];
  /** 마지막 액션으로 처음 보게 된 orderId 전부(첫 조회 포함). 수신 확인(ack) 대상. */
  lastAdded: string[];
  /** 실시간 사건으로 온 주문 가운데 이미 가진 것과 같거나 오래돼 버린 건수(누적). 상태 변경 응답은 세지 않는다. */
  droppedCount: number;
}

export const initialOrdersState: OrdersState = {
  orders: {},
  touched: {},
  seq: 0,
  seenOrderIds: [],
  inFlight: {},
  pickedUpAt: {},
  lastNew: [],
  lastAdded: [],
  droppedCount: 0,
};

export type OrdersAction =
  /** 서버 조회 결과. fromSeq는 조회를 시작할 때의 state.seq. */
  | {
      type: "loaded";
      orders: Order[];
      silent: boolean;
      fromSeq: number;
      /** 오늘 0시(ms). 마지막 변경(updatedAt)이 이보다 전인 취소 · 환불 주문은 치운다. */
      dayStart: number;
    }
  /** 실시간 사건(기본) 또는 상태 변경 응답(source: "response")으로 받은 주문 하나. */
  | { type: "received"; order: Order; source?: "response" }
  | { type: "request-started"; orderId: string }
  | { type: "request-finished"; orderId: string }
  | { type: "pickup-confirmed"; orderId: string; at: number }
  | { type: "reset" };

/** 최근 SEEN_LIMIT개만 남긴다. */
function trimSeen(list: string[]): string[] {
  return list.length > SEEN_LIMIT ? list.slice(-SEEN_LIMIT) : list;
}

/** 이미 처리한 사건인지 확인하고 기억한다 (스펙 3.2-2). 중복이면 list는 그대로다. */
export function rememberEventId(
  list: string[],
  eventId: string,
): { list: string[]; duplicate: boolean } {
  if (list.includes(eventId)) return { list, duplicate: true };
  return { list: trimSeen([...list, eventId]), duplicate: false };
}

function merge(
  state: OrdersState,
  incoming: Order[],
  options: { silent: boolean; countDropped: boolean },
): OrdersState {
  const orders = { ...state.orders };
  const touched = { ...state.touched };
  const pickedUpAt = { ...state.pickedUpAt };
  const seen = new Set(state.seenOrderIds);
  const added: string[] = [];
  const lastNew: string[] = [];
  let seq = state.seq;
  let dropped = state.droppedCount;

  for (const order of incoming) {
    const current = orders[order.orderId];
    // 같거나 오래된 변경은 버린다. 조회 결과와 실시간 사건이 엇갈려도 최신만 남는다 (스펙 3.2-3).
    if (current && order.updatedAt <= current.updatedAt) {
      if (options.countDropped) dropped += 1;
      continue;
    }
    seq += 1;
    orders[order.orderId] = order;
    touched[order.orderId] = seq;
    if (order.status !== "picked-up") delete pickedUpAt[order.orderId];
    // 이미 가진 주문은 seen에서 밀려났더라도 새 주문으로 다시 알리지 않는다.
    if (!current && !seen.has(order.orderId)) {
      seen.add(order.orderId);
      added.push(order.orderId);
      // 이미 처리된 주문(접수대기가 아님)이나 첫 조회로 들어온 주문은 알리지 않는다 (스펙 3.2-4).
      if (!options.silent && order.status === "pending") {
        lastNew.push(order.orderId);
      }
    }
  }

  return {
    ...state,
    orders,
    touched,
    seq,
    pickedUpAt,
    seenOrderIds: trimSeen([...state.seenOrderIds, ...added]),
    lastNew,
    lastAdded: added,
    droppedCount: dropped,
  };
}

export function ordersReducer(
  state: OrdersState,
  action: OrdersAction,
): OrdersState {
  switch (action.type) {
    case "loaded": {
      const merged = merge(state, action.orders, {
        silent: action.silent,
        countDropped: false,
      });
      // 조회 전에 있던 주문이 응답에 없으면 서버에서 사라진 것이다(예: 어제 픽업완료 · 서버가 지운 주문).
      // 조회 도중 들어온 주문(touched > fromSeq)과 오늘 바뀐 취소 · 환불 주문(응답에 원래 없다)은 남긴다.
      const present = new Set(action.orders.map((o) => o.orderId));
      const orders = { ...merged.orders };
      const touched = { ...merged.touched };
      const pickedUpAt = { ...merged.pickedUpAt };
      for (const id of Object.keys(orders)) {
        if (present.has(id)) continue;
        // 취소 · 환불 주문은 응답에 원래 없으므로 오늘 바뀐 것만 남긴다(어제 취소 · 오늘 환불도 오늘 하루 남는다). 안 치우면 며칠 켜 두는 동안 쌓인다 (설계 원칙 5).
        if (
          isCancelledStatus(orders[id].status) &&
          orders[id].updatedAt >= action.dayStart
        ) {
          continue;
        }
        if ((touched[id] ?? 0) > action.fromSeq) continue;
        delete orders[id];
        delete touched[id];
        delete pickedUpAt[id];
      }
      return { ...merged, orders, touched, pickedUpAt };
    }
    case "received":
      return merge(state, [action.order], {
        silent: false,
        // 상태 변경 응답은 같은 변경의 실시간 사건보다 늦게 오는 게 보통이라 "버림"으로 세면 로그가 부푼다.
        countDropped: action.source !== "response",
      });
    case "request-started":
      return {
        ...state,
        lastNew: [],
        lastAdded: [],
        inFlight: { ...state.inFlight, [action.orderId]: true },
      };
    case "request-finished": {
      const inFlight = { ...state.inFlight };
      delete inFlight[action.orderId];
      return { ...state, lastNew: [], lastAdded: [], inFlight };
    }
    case "pickup-confirmed":
      return {
        ...state,
        lastNew: [],
        lastAdded: [],
        pickedUpAt: { ...state.pickedUpAt, [action.orderId]: action.at },
      };
    case "reset":
      return initialOrdersState;
  }
}

/** 처리할 주문(접수대기 · 제조중 · 제조완료) 건수 (Q04). */
export function countPendingOrders(state: OrdersState): number {
  return Object.values(state.orders).filter((o) =>
    PENDING_STATUSES.includes(o.status),
  ).length;
}

/** [픽업완료]를 누른 지 5초 안인지 (Q22). */
export function canUndoPickup(
  state: OrdersState,
  orderId: string,
  now: number,
): boolean {
  const at = state.pickedUpAt[orderId];
  return at !== undefined && now - at <= UNDO_WINDOW_MS;
}
