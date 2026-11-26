import { describe, expect, it } from "vitest";
import type { Order, OrderAction, OrderStatus } from "../api/orders";
import {
  ACTION_TRANSITIONS,
  UNDO_WINDOW_MS,
  canApplyAction,
  canUndoPickup,
  countPendingOrders,
  initialOrdersState,
  ordersReducer,
  rememberEventId,
  SEEN_LIMIT,
  type OrdersAction,
  type OrdersState,
} from "./orders-state";

function order(
  id: string,
  status: OrderStatus = "pending",
  updatedAt = 1,
): Order {
  return {
    orderId: id,
    orderNumber: "2611180000010001",
    pickupNumber: 1,
    status,
    updatedAt,
    paidAt: updatedAt,
    pickupChoice: "10min",
    items: [{ name: "시험 음료", quantity: 1 }],
    customerName: "홍*동",
    phoneLast4: "0000",
    statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
  };
}

function run(actions: OrdersAction[], from: OrdersState = initialOrdersState) {
  return actions.reduce(ordersReducer, from);
}

describe("상태 변경 표 (스펙 2.1)", () => {
  const ALL: OrderStatus[] = [
    "pending",
    "preparing",
    "ready",
    "picked-up",
    "store-cancelled",
    "customer-cancelled",
  ];
  const EXPECTED: Record<OrderAction, Array<[OrderStatus, OrderStatus]>> = {
    accept: [["pending", "preparing"]],
    cancel: [
      ["pending", "store-cancelled"],
      ["preparing", "store-cancelled"],
      ["ready", "store-cancelled"],
      ["picked-up", "store-cancelled"],
    ],
    complete: [["preparing", "ready"]],
    pickup: [["ready", "picked-up"]],
    "undo-pickup": [["picked-up", "ready"]],
  };

  for (const action of Object.keys(EXPECTED) as OrderAction[]) {
    it(`${action}: 표에 있는 상태에서만 허용한다`, () => {
      const allowed = ALL.filter((s) => canApplyAction(s, action));
      expect(allowed).toEqual(EXPECTED[action].map(([from]) => from));
      for (const [from, to] of EXPECTED[action]) {
        expect(ACTION_TRANSITIONS[action].to).toBe(to);
        expect(canApplyAction(from, action)).toBe(true);
      }
    });
  }

  it("제조완료 · 픽업완료에서도 취소할 수 있다 (T18, Q17 변경)", () => {
    expect(canApplyAction("ready", "cancel")).toBe(true);
    expect(canApplyAction("picked-up", "cancel")).toBe(true);
  });
});

describe("주문 합치기: 중복 · 순서", () => {
  it("같은 주문이 두 번 와도 한 번만 넣고 새 주문은 한 번만 알린다", () => {
    const a = order("o1");
    const first = run([{ type: "received", order: a }]);
    expect(first.lastNew).toEqual(["o1"]);
    const second = ordersReducer(first, { type: "received", order: a });
    expect(Object.keys(second.orders)).toEqual(["o1"]);
    expect(second.lastNew).toEqual([]);
    expect(second.lastAdded).toEqual([]);
    expect(second.droppedCount).toBe(1);
  });

  it("가지고 있는 것보다 오래된 updatedAt은 버린다", () => {
    const state = run([
      { type: "received", order: order("o1", "preparing", 10) },
      { type: "received", order: order("o1", "pending", 5) },
    ]);
    expect(state.orders.o1.status).toBe("preparing");
  });

  it("더 새로운 updatedAt은 덮어쓴다", () => {
    const state = run([
      { type: "received", order: order("o1", "pending", 5) },
      { type: "received", order: order("o1", "preparing", 10) },
    ]);
    expect(state.orders.o1.status).toBe("preparing");
    expect(state.lastNew).toEqual([]); // 이미 본 주문은 새 주문이 아니다
  });

  it("접수대기가 아닌 주문이 처음 들어오면 새 주문 신호를 내지 않는다", () => {
    const state = run([{ type: "received", order: order("o1", "preparing") }]);
    expect(state.lastNew).toEqual([]);
    expect(state.lastAdded).toEqual(["o1"]);
  });

  it("처음 조회(silent)는 새 주문 신호를 내지 않지만 이미 본 것으로 기억한다 (3.2-4)", () => {
    const loaded = run([
      {
        type: "loaded",
        orders: [order("o1")],
        silent: true,
        fromSeq: 0,
        dayStart: 0,
      },
    ]);
    expect(loaded.lastNew).toEqual([]);
    expect(loaded.lastAdded).toEqual(["o1"]);
    const again = ordersReducer(loaded, {
      type: "received",
      order: order("o1"),
    });
    expect(again.lastNew).toEqual([]);
  });

  it("처음 조회가 아니면 새로 보이는 접수대기 주문을 알린다", () => {
    const state = run([
      {
        type: "loaded",
        orders: [order("o1"), order("o2")],
        silent: false,
        fromSeq: 0,
        dayStart: 0,
      },
    ]);
    expect(state.lastNew).toEqual(["o1", "o2"]);
  });

  it("본 주문 번호는 최근 1,000개만 기억한다", () => {
    const orders = Array.from({ length: SEEN_LIMIT + 5 }, (_, i) =>
      order(`o${i}`),
    );
    const state = run([
      { type: "loaded", orders, silent: true, fromSeq: 0, dayStart: 0 },
    ]);
    expect(state.seenOrderIds).toHaveLength(SEEN_LIMIT);
    expect(state.seenOrderIds[SEEN_LIMIT - 1]).toBe(`o${SEEN_LIMIT + 4}`);
  });
});

describe("이미 본 접수대기 주문이 더 새로운 updatedAt으로 다시 와도 새 주문이 아니다", () => {
  it("첫 조회(신호 없음) 뒤 갱신이 와도 알리지 않는다", () => {
    const state = run([
      {
        type: "loaded",
        orders: [order("o1", "pending", 1)],
        silent: true,
        fromSeq: 0,
        dayStart: 0,
      },
      { type: "received", order: order("o1", "pending", 2) },
    ]);
    expect(state.lastNew).toEqual([]);
    expect(state.orders.o1.updatedAt).toBe(2);
  });
});

describe("전체 조회가 사라진 주문을 치운다", () => {
  it("조회 시작 전에 있던 처리 중 주문이 응답에 없으면 지운다 (0시 자동 픽업완료 등)", () => {
    const before = run([
      { type: "received", order: order("o1", "preparing") },
      { type: "received", order: order("o2", "pending") },
    ]);
    const state = ordersReducer(before, {
      type: "loaded",
      orders: [order("o2", "pending")],
      silent: false,
      fromSeq: before.seq,
      dayStart: 0,
    });
    expect(Object.keys(state.orders)).toEqual(["o2"]);
  });

  it("조회 중에 이벤트로 들어온 주문은 응답에 없어도 지우지 않는다", () => {
    const seq = initialOrdersState.seq;
    const during = run([{ type: "received", order: order("o9") }]);
    const state = ordersReducer(during, {
      type: "loaded",
      orders: [],
      silent: false,
      fromSeq: seq,
      dayStart: 0,
    });
    expect(state.orders.o9).toBeDefined();
  });

  it("어제 취소된 주문은 조회 뒤 사라진다 (며칠 켜 둬도 쌓이지 않게)", () => {
    const before = run([
      { type: "received", order: order("old", "customer-cancelled", 5) },
      { type: "received", order: order("today", "store-cancelled", 50) },
    ]);
    const state = ordersReducer(before, {
      type: "loaded",
      orders: [],
      silent: false,
      fromSeq: before.seq,
      dayStart: 10,
    });
    expect(Object.keys(state.orders)).toEqual(["today"]);
    expect(Object.keys(state.touched)).toEqual(["today"]);
  });

  it("오늘 취소 · 환불된 주문은 응답에 없어도 남긴다", () => {
    const before = run([
      { type: "received", order: order("o1", "customer-cancelled") },
      { type: "received", order: order("o2", "refunded") },
    ]);
    const state = ordersReducer(before, {
      type: "loaded",
      orders: [],
      silent: false,
      fromSeq: before.seq,
      dayStart: 0,
    });
    expect(state.orders.o1).toBeDefined();
    expect(state.orders.o2).toBeDefined();
  });
});

describe("신호 목록은 합치는 액션 뒤에만 남는다", () => {
  it("다른 액션은 lastNew · lastAdded를 비워 같은 주문을 다시 알리지 않는다", () => {
    const received = run([{ type: "received", order: order("o1") }]);
    expect(received.lastNew).toEqual(["o1"]);
    for (const action of [
      { type: "request-started", orderId: "o1" },
      { type: "request-finished", orderId: "o1" },
      { type: "pickup-confirmed", orderId: "o1", at: 1 },
    ] as const) {
      const next = ordersReducer(received, action);
      expect(next.lastNew).toEqual([]);
      expect(next.lastAdded).toEqual([]);
    }
  });

  it("본 목록에서 밀려난 주문이라도 이미 가지고 있으면 새 주문으로 다시 알리지 않는다", () => {
    const first = run([{ type: "received", order: order("o1", "pending", 1) }]);
    const evicted = { ...first, seenOrderIds: [] };
    const next = ordersReducer(evicted, {
      type: "received",
      order: order("o1", "pending", 2),
    });
    expect(next.lastNew).toEqual([]);
    expect(next.lastAdded).toEqual([]);
  });

  it("상태 변경 응답으로 버려진 주문은 버림 건수에 세지 않는다", () => {
    const state = run([
      { type: "received", order: order("o1", "preparing", 5) },
      {
        type: "received",
        order: order("o1", "preparing", 5),
        source: "response",
      },
    ]);
    expect(state.droppedCount).toBe(0);
  });
});

describe("처리할 주문 건수 (Q04)", () => {
  it("접수대기 · 제조중 · 제조완료만 센다", () => {
    const statuses: OrderStatus[] = [
      "pending",
      "preparing",
      "ready",
      "picked-up",
      "store-cancelled",
      "customer-cancelled",
    ];
    const state = run(
      statuses.map((s, i) => ({ type: "received", order: order(`o${i}`, s) })),
    );
    expect(countPendingOrders(state)).toBe(3);
  });
});

describe("요청 중 · 되돌리기 5초", () => {
  it("요청 중 표시를 켜고 끈다", () => {
    const on = run([{ type: "request-started", orderId: "o1" }]);
    expect(on.inFlight.o1).toBe(true);
    expect(
      ordersReducer(on, { type: "request-finished", orderId: "o1" }).inFlight
        .o1,
    ).toBeUndefined();
  });

  it("픽업완료 5초 안에만 되돌릴 수 있다", () => {
    const state = run([
      { type: "received", order: order("o1", "picked-up") },
      { type: "pickup-confirmed", orderId: "o1", at: 1_000 },
    ]);
    expect(canUndoPickup(state, "o1", 1_000 + UNDO_WINDOW_MS)).toBe(true);
    expect(canUndoPickup(state, "o1", 1_000 + UNDO_WINDOW_MS + 1)).toBe(false);
    expect(canUndoPickup(state, "none", 1_000)).toBe(false);
  });

  it("제조완료로 돌아가면 픽업 시각을 지운다", () => {
    const state = run([
      { type: "received", order: order("o1", "picked-up", 1) },
      { type: "pickup-confirmed", orderId: "o1", at: 1_000 },
      { type: "received", order: order("o1", "ready", 2) },
    ]);
    expect(state.pickedUpAt.o1).toBeUndefined();
  });

  it("reset은 처음 상태로 돌린다", () => {
    const state = run([
      { type: "received", order: order("o1") },
      { type: "reset" },
    ]);
    expect(state).toEqual(initialOrdersState);
  });
});

describe("rememberEventId", () => {
  it("처음 본 사건은 기억하고, 다시 오면 중복이라고 알린다", () => {
    const a = rememberEventId([], "e1");
    expect(a).toEqual({ list: ["e1"], duplicate: false });
    expect(rememberEventId(a.list, "e1").duplicate).toBe(true);
  });

  it("최근 1,000개까지만 기억한다", () => {
    let list: string[] = [];
    for (let i = 0; i < SEEN_LIMIT + 10; i += 1) {
      list = rememberEventId(list, `e${i}`).list;
    }
    expect(list).toHaveLength(SEEN_LIMIT);
    expect(rememberEventId(list, "e0").duplicate).toBe(false);
    expect(rememberEventId(list, `e${SEEN_LIMIT + 9}`).duplicate).toBe(true);
  });
});
