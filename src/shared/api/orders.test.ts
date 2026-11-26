import { describe, expect, it, vi } from "vitest";
import type { OrderEvent } from "./order-feed";
import {
  createMockOrderBackend,
  isCancelledStatus,
  type OrderStatus,
} from "./orders";

describe("모의 서버", () => {
  it("상태가 바뀔 때마다 상태별 시각을 채우고, 완료 취소하면 픽업완료 시각을 지운다 (T05 결정 B)", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(1);
    const [order] = await backend.api.fetchOrders();
    expect(order.statusTimes).toEqual({
      preparingAt: null,
      readyAt: null,
      pickedUpAt: null,
    });
    const send = (action: "accept" | "complete" | "pickup" | "undo-pickup") =>
      backend.api.changeStatus({
        orderId: order.orderId,
        action,
        idempotencyKey: `k-${action}`,
      });
    const times = async () => (await backend.api.fetchOrders())[0].statusTimes;

    await send("accept");
    const afterAccept = await times();
    expect(afterAccept.preparingAt).toEqual(expect.any(Number));
    expect(afterAccept.readyAt).toBeNull();
    await send("complete");
    expect((await times()).readyAt).toEqual(expect.any(Number));
    await send("pickup");
    const afterPickup = await times();
    expect(afterPickup.pickedUpAt).toEqual(expect.any(Number));
    expect(afterPickup.readyAt).toEqual(expect.any(Number));
    expect(afterPickup.preparingAt).toBe(afterAccept.preparingAt);
    await send("undo-pickup");
    expect((await times()).pickedUpAt).toBeNull();
    // 제조완료가 된 처음 시각은 그대로다
    expect((await times()).readyAt).toBe(afterPickup.readyAt);
  });

  it("같은 멱등키로 다시 보내도 한 번만 처리한다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(1);
    const [order] = await backend.api.fetchOrders();
    const request = {
      orderId: order.orderId,
      action: "accept" as const,
      idempotencyKey: "k1",
    };

    const first = await backend.api.changeStatus(request);
    const second = await backend.api.changeStatus(request);

    expect(first.kind).toBe("ok");
    expect(second).toEqual(first);
    expect((await backend.api.fetchOrders())[0].status).toBe("preparing");
  });

  it("다른 PC가 먼저 처리했으면 already-handled, 고객이 먼저 취소했으면 customer-cancelled", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(2);
    const [a, b] = await backend.api.fetchOrders();
    backend.dev.otherPcAcceptsOldestPending();
    backend.dev.customerCancelsOldestPending();

    const r1 = await backend.api.changeStatus({
      orderId: a.orderId,
      action: "accept",
      idempotencyKey: "k1",
    });
    const r2 = await backend.api.changeStatus({
      orderId: b.orderId,
      action: "accept",
      idempotencyKey: "k2",
    });

    expect(r1.kind).toBe("already-handled");
    expect(r2.kind).toBe("customer-cancelled");
  });

  it("제조완료 · 오늘 픽업완료는 취소되고, 결제가 오늘 0시 전인 픽업완료는 too-late로 거절한다 (T18, 가정)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 10, 25, 23, 50));
      const backend = createMockOrderBackend({ delayMs: 0 });
      backend.dev.addOrders(3);
      const ids = (await backend.api.fetchOrders()).map((o) => o.orderId);
      const send = (i: number, action: "complete" | "pickup" | "cancel") =>
        backend.api.changeStatus({
          orderId: ids[i],
          action,
          reason: action === "cancel" ? "시험" : undefined,
          idempotencyKey: `k-${i}-${action}`,
        });
      for (const i of [0, 1, 2]) {
        await backend.api.changeStatus({
          orderId: ids[i],
          action: "accept",
          idempotencyKey: `k-${i}-accept`,
        });
        await send(i, "complete");
      }
      await send(1, "pickup");
      await send(2, "pickup");

      expect((await send(0, "cancel")).kind).toBe("ok"); // 제조완료
      expect((await send(1, "cancel")).kind).toBe("ok"); // 결제한 날 픽업완료

      vi.setSystemTime(new Date(2026, 10, 26, 0, 10)); // 0시가 지났다
      const late = await send(2, "cancel");
      expect(late.kind).toBe("too-late");
      expect(late.order.status).toBe("picked-up"); // 상태는 그대로
    } finally {
      vi.useRealTimers();
    }
  });

  it("재제조: 제조완료 · 오늘 픽업완료는 기록을 쌓고 상태는 그대로, 취소됐거나 0시가 지났으면 거절한다 (T21, 가정)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 10, 25, 23, 50));
      const backend = createMockOrderBackend({ delayMs: 0 });
      backend.dev.addOrders(3);
      const ids = (await backend.api.fetchOrders()).map((o) => o.orderId);
      for (const i of [0, 1, 2]) {
        for (const action of ["accept", "complete"] as const) {
          await backend.api.changeStatus({
            orderId: ids[i],
            action,
            idempotencyKey: `k-${i}-${action}`,
          });
        }
      }
      await backend.api.changeStatus({
        orderId: ids[1],
        action: "pickup",
        idempotencyKey: "k-1-pickup",
      });
      backend.dev.customerCancels(ids[2]);
      const remake = (i: number, key: string, reason = "이물질") =>
        backend.api.requestRemake({
          orderId: ids[i],
          items: [{ itemIndex: 0, quantity: 1 }],
          reason,
          fault: "store",
          idempotencyKey: key,
        });

      const first = await remake(0, "r1");
      expect(first.kind).toBe("ok");
      expect(first.order.status).toBe("ready");
      expect((await remake(0, "r1")).kind).toBe("ok"); // 같은 키: 한 번만 기록
      await remake(0, "r2", "고객 주문 실수");
      expect((await remake(1, "r3")).kind).toBe("ok");
      const rejected = await remake(2, "r4");
      expect(rejected.kind).toBe("rejected");
      expect(rejected.order.status).toBe("customer-cancelled");

      const detail = await backend.historyApi.fetchDetail(ids[0]);
      expect(detail.remakes.map((r) => r.reason)).toEqual([
        "이물질",
        "고객 주문 실수",
      ]);
      expect(detail.remakes[0].items).toEqual([{ itemIndex: 0, quantity: 1 }]);
      expect(detail.status).toBe("ready");

      // 가정: 없는 줄 · 주문 수량을 넘는 수량 · 빈 목록은 화면 버그로 보고 오류
      for (const items of [
        [],
        [{ itemIndex: 9, quantity: 1 }],
        [{ itemIndex: 0, quantity: 2 }], // 짧은 주문은 1잔
        [{ itemIndex: 0, quantity: 0 }],
        [
          { itemIndex: 0, quantity: 1 },
          { itemIndex: 0, quantity: 1 },
        ], // 같은 줄 두 번
      ]) {
        await expect(
          backend.api.requestRemake({
            orderId: ids[0],
            items,
            reason: "이물질",
            fault: "store",
            idempotencyKey: `bad-${JSON.stringify(items)}`,
          }),
        ).rejects.toThrow();
      }

      vi.setSystemTime(new Date(2026, 10, 26, 0, 10)); // 0시가 지났다
      expect((await remake(1, "r5")).kind).toBe("rejected");
      expect((await remake(0, "r6")).kind).toBe("ok"); // 제조완료는 날짜와 상관없음
    } finally {
      vi.useRealTimers();
    }
  });

  it("끊기면 요청이 실패하고 주문받기를 끄며, 이어지면 직전 상태로 되돌린다 (11장 I)", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await backend.storeStatusApi.setAcceptingOrders(true);

    backend.dev.setConnected(false);
    expect(backend.dev.isAccepting()).toBe(false);
    await expect(backend.api.fetchOrders()).rejects.toThrow();
    expect(() =>
      backend.subscribe(
        () => {},
        () => {},
      ),
    ).toThrow();

    backend.dev.setConnected(true);
    expect(backend.dev.isAccepting()).toBe(true);
  });

  it("끊기면 구독자에게 알리고, 끊긴 동안 생긴 주문은 보관했다가 조회로 준다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const onClose = vi.fn();
    const events: OrderEvent[] = [];
    backend.subscribe((e) => events.push(e), onClose);

    backend.dev.setConnected(false);
    backend.dev.addOrders(1);
    backend.dev.setConnected(true);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(0);
    expect(await backend.api.fetchOrders()).toHaveLength(1);
  });

  it("조회에는 취소된 주문이 들어 있지 않고, updatedAt은 계속 늘어난다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(3);
    backend.dev.customerCancelsOldestPending();

    const orders = await backend.api.fetchOrders();

    expect(orders).toHaveLength(2);
    const times = orders.map((o) => o.updatedAt);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
    expect(new Set(times).size).toBe(times.length);
  });

  it("[가장 최근 취소 → 환불 완료]: 가장 최근 취소 주문이 환불로 바뀌고 취소 정보에 환불 시각이 붙는다 (T22, 가정)", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const events: OrderEvent[] = [];
    backend.subscribe(
      (e) => events.push(e),
      () => {},
    );
    backend.dev.addOrders(3);
    const ids = (await backend.api.fetchOrders()).map((o) => o.orderId);
    backend.dev.customerCancels(ids[0]);
    await backend.api.changeStatus({
      orderId: ids[1],
      action: "cancel",
      reason: "재료 소진",
      idempotencyKey: "k1",
    });

    backend.dev.refundLatestCancelled();

    const refunded = await backend.historyApi.fetchDetail(ids[1]);
    expect(refunded.status).toBe("refunded");
    expect(refunded.cancel).toMatchObject({ by: "store", reason: "재료 소진" });
    expect(refunded.cancel?.refundedAt).toBe(refunded.updatedAt);
    expect((await backend.historyApi.fetchDetail(ids[0])).status).toBe(
      "customer-cancelled",
    );
    const last = events[events.length - 1];
    expect(last.type === "order-updated" && last.order.status).toBe("refunded");
    // 환불도 처리할 주문 조회에 없다
    expect((await backend.api.fetchOrders()).map((o) => o.orderId)).toEqual([
      ids[2],
    ]);
    // 이미 환불된 주문은 다시 고르지 않는다
    backend.dev.refundLatestCancelled();
    expect((await backend.historyApi.fetchDetail(ids[0])).status).toBe(
      "refunded",
    );
  });

  it("isCancelledStatus: 매장취소 · 고객취소 · 환불만 취소로 본다 (T22)", () => {
    const all: OrderStatus[] = [
      "pending",
      "preparing",
      "ready",
      "picked-up",
      "store-cancelled",
      "customer-cancelled",
      "refunded",
    ];
    expect(all.filter(isCancelledStatus)).toEqual([
      "store-cancelled",
      "customer-cancelled",
      "refunded",
    ]);
  });

  it("전체 주문 삭제는 취소 · 픽업완료까지 모두 지우고 구독자에게 알린다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const events: string[] = [];
    backend.subscribe(
      (e) => events.push(e.type),
      () => {},
    );
    backend.dev.addOrders(2);
    backend.dev.customerCancelsOldestPending();
    backend.dev.deleteAllOrders();
    expect(await backend.api.fetchOrders()).toEqual([]);
    expect(events[events.length - 1]).toBe("orders-cleared");
    backend.dev.addOrders(1);
    const [fresh] = await backend.api.fetchOrders();
    expect(fresh.pickupNumber).toBe(1);
    expect(fresh.orderId).not.toBe("mock-order-1"); // 지우기 전 orderId는 다시 쓰지 않는다
  });
});
