import { describe, expect, it, vi } from "vitest";
import type { OrderEvent } from "./order-feed";
import { createMockOrderBackend } from "./orders";

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
