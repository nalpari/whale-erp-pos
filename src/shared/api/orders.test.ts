import { describe, expect, it, vi } from "vitest";
import type { OrderEvent } from "./order-feed";
import { createMockOrderBackend } from "./orders";

describe("모의 서버", () => {
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
});
