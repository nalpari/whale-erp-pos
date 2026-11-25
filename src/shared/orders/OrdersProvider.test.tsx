import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../api/auth";
import {
  createMockOrderFeed,
  type OrderEvent,
  type OrderFeed,
} from "../api/order-feed";
import {
  createMockOrderBackend,
  type Order,
  type OrderApi,
} from "../api/orders";
import { createFakeLogApi } from "../log/log-api";
import { createFakeWindow } from "../../test/fakes";
import {
  AppShellProvider,
  useAppShell,
} from "../../features/app-shell/AppShellContext";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../printer/printer-api";
import { createMemoryTokenStore } from "../session/token-store";
import type { SoundPlayer } from "../sound/sound-player";
import { HEARTBEAT_MS, POLL_MS, type StatusOutcome } from "./order-sync";
import { ORDER_MESSAGES } from "./order-texts";
import { OrdersProvider } from "./OrdersProvider";
import { useOrders, type OrdersContextValue } from "./orders-context";

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

let orders: OrdersContextValue;
let shell: ReturnType<typeof useAppShell>;

function Probe() {
  const latestOrders = useOrders();
  const latestShell = useAppShell();
  // 렌더 중에는 바깥 변수를 바꾸지 않는다. 효과는 act 안에서 끝나므로 테스트는 곧바로 읽을 수 있다.
  useEffect(() => {
    orders = latestOrders;
    shell = latestShell;
  });
  return null;
}

function makeSound() {
  return { playNewOrder: vi.fn(), playWarning: vi.fn() } satisfies SoundPlayer;
}

interface Setup {
  api?: OrderApi;
  feed?: OrderFeed;
  backend?: ReturnType<typeof createMockOrderBackend>;
  session?: Session | null;
}

async function setup(options: Setup = {}) {
  const backend = options.backend ?? createMockOrderBackend({ delayMs: 0 });
  const sound = makeSound();
  const newOrders: Order[] = [];
  const ui = (session: Session | null) => (
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={backend.storeStatusApi}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={createMemoryTokenStore()}
      printerApi={createFakePrinterApi()}
      printerSettingsStore={createMemoryPrinterSettingsStore()}
      logApi={createFakeLogApi()}
      initialSession={session}
    >
      <OrdersProvider
        orderApi={options.api ?? backend.api}
        orderFeed={options.feed ?? createMockOrderFeed(backend)}
        storeStatusApi={backend.storeStatusApi}
        sound={sound}
      >
        <Probe />
      </OrdersProvider>
    </AppShellProvider>
  );
  const view = render(
    ui(options.session === undefined ? STORE : options.session),
  );
  await flush();
  const unsubscribe = orders?.onNewOrder((o) => newOrders.push(o));
  return { backend, sound, newOrders, view, unsubscribe, ui };
}

/** 대기 중인 Promise를 모두 처리한다 (시계는 움직이지 않는다). */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("받기 (스펙 3.1 · 3.2)", () => {
  it("로그인하면 처리할 주문을 한 번 조회해 채우고, 첫 조회는 새 주문 신호를 내지 않고 ack한다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(3); // 프로그램이 꺼져 있는 동안 들어온 주문
    const ack = vi.spyOn(backend.api, "ackOrders");
    const feed = createMockOrderFeed(backend);
    const { newOrders } = await setup({ backend, feed });
    // 신호는 구독 전에 끝났을 수 있으니 다시 확인용으로 따로 구독한 목록도 본다
    expect(orders.orders).toHaveLength(3);
    expect(orders.pendingOrderCount).toBe(3);
    expect(newOrders).toHaveLength(0);
    expect(ack).toHaveBeenCalledWith(orders.orders.map((o) => o.orderId));
  });

  it("주문 100건을 섞인 순서 · 중복 포함으로 보내도 100건이고 새 주문 신호는 100번이다 (완료 기준 1)", async () => {
    let emit: (e: OrderEvent) => void = () => {};
    const feed: OrderFeed = {
      connect: async ({ onEvent }) => {
        emit = onEvent;
        return () => {};
      },
    };
    const backend = createMockOrderBackend({ delayMs: 0 });
    const { newOrders } = await setup({ backend, feed });
    const make = (i: number): Order => ({
      orderId: `bulk-${i}`,
      orderNumber: "2611180000010001",
      pickupNumber: i,
      status: "pending",
      updatedAt: 100 + i,
      paidAt: 100 + i,
      pickupChoice: "10min",
      items: [{ name: "시험", quantity: 1 }],
      customerName: "홍*동",
      phoneLast4: "0000",
      statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
    });
    const events: OrderEvent[] = [];
    for (let i = 0; i < 100; i += 1) {
      events.push({ eventId: `e${i}`, type: "order-created", order: make(i) });
    }
    // 같은 사건(eventId 같음) 50건 + 같은 주문 다른 사건 50건을 섞는다.
    for (let i = 0; i < 50; i += 1) events.push(events[i]);
    for (let i = 50; i < 100; i += 1) {
      events.push({
        eventId: `dup${i}`,
        type: "order-created",
        order: make(i),
      });
    }
    // 결정적인 섞기
    const shuffled = events
      .map((e, i) => ({ e, k: (i * 7919) % events.length }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.e);
    act(() => shuffled.forEach((e) => emit(e)));
    await flush();

    expect(orders.orders).toHaveLength(100);
    expect(newOrders).toHaveLength(100);
    expect(new Set(newOrders.map((o) => o.orderId)).size).toBe(100);
  });

  it("실시간으로 들어온 새 주문은 신호를 한 번 내고, 서버에 수신 확인을 보낸다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const ack = vi.spyOn(backend.api, "ackOrders");
    const { newOrders } = await setup({ backend });
    act(() => backend.dev.addOrders(1));
    await flush();

    expect(orders.orders).toHaveLength(1);
    expect(newOrders).toHaveLength(1);
    expect(ack).toHaveBeenLastCalledWith([orders.orders[0].orderId]);
  });

  it("[같은 주문 다시 보내기]를 눌러도 목록과 신호는 늘지 않는다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const { newOrders } = await setup({ backend });
    act(() => backend.dev.addOrders(1));
    act(() => {
      backend.dev.resendLastOrder();
      backend.dev.resendLastOrder();
    });
    await flush();

    expect(orders.orders).toHaveLength(1);
    expect(newOrders).toHaveLength(1);
  });

  it("ack가 실패하면 다음 조회 때 다시 보낸다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const ack = vi
      .spyOn(backend.api, "ackOrders")
      .mockRejectedValueOnce(new Error("실패"));
    await setup({ backend });
    act(() => backend.dev.addOrders(1));
    await flush();
    expect(ack).toHaveBeenCalledTimes(1);

    await advance(POLL_MS);

    expect(ack).toHaveBeenCalledTimes(2);
    expect(ack).toHaveBeenLastCalledWith([orders.orders[0].orderId]);
  });

  it("30초 재조회가 실시간으로 못 받은 주문을 채운다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const silentFeed: OrderFeed = { connect: async () => () => {} };
    const { newOrders } = await setup({ backend, feed: silentFeed });
    act(() => backend.dev.addOrders(2)); // 실시간으로는 안 온다
    await flush();
    expect(orders.orders).toHaveLength(0);

    await advance(POLL_MS);

    expect(orders.orders).toHaveLength(2);
    expect(newOrders).toHaveLength(2);
  });

  it("[새로고침]은 서버에서 전체를 다시 받고 로그인 · 주문받기는 그대로 둔다 (Q05)", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const silentFeed: OrderFeed = { connect: async () => () => {} };
    await setup({ backend, feed: silentFeed });
    await act(async () => shell.actions.requestAccepting(true));
    await flush();
    act(() => backend.dev.addOrders(1));

    await act(async () => {
      await orders.refresh();
    });

    expect(orders.orders).toHaveLength(1);
    expect(shell.state.session).not.toBeNull();
    expect(shell.state.accepting).toBe(true);
  });

  it("로그아웃하면 실시간 연결을 닫는다", async () => {
    const stop = vi.fn();
    const feed: OrderFeed = { connect: async () => stop };
    await setup({ feed });

    act(() => shell.actions.openDialog("logout"));
    await act(async () => shell.actions.confirmDialog());
    await flush();

    expect(stop).toHaveBeenCalled();
  });

  it("다시 연결 중에 로그아웃해도 연결 상태는 처음으로 돌아간다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });
    act(() => backend.dev.setConnected(false));
    await flush();
    expect(orders.connection).toBe("reconnecting");

    act(() => shell.actions.openDialog("logout"));
    await act(async () => shell.actions.confirmDialog());
    await flush();

    expect(orders.connection).toBe("connected");
  });

  it("로그아웃하면 수신을 멈추고 목록을 비운다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(2);
    const hb = vi.spyOn(backend.api, "sendHeartbeat");
    await setup({ backend });
    expect(orders.orders).toHaveLength(2);

    act(() => shell.actions.openDialog("logout"));
    await act(async () => shell.actions.confirmDialog());
    await flush();
    expect(shell.state.session).toBeNull();
    expect(orders.orders).toHaveLength(0);

    await advance(HEARTBEAT_MS * 4);
    expect(hb).not.toHaveBeenCalled();
    // 끊어진 실시간 연결로 들어오는 주문도 받지 않는다.
    act(() => backend.dev.addOrders(1));
    await flush();
    expect(orders.orders).toHaveLength(0);
  });
});

describe("상태 변경 (스펙 3.3)", () => {
  async function withOnePending() {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const ctx = await setup({ backend });
    act(() => backend.dev.addOrders(1));
    await flush();
    return { backend, ctx, id: orders.orders[0].orderId };
  }

  it("서버 성공 뒤에만 상태가 바뀌고 접수되면 '접수됨' 신호를 낸다", async () => {
    const { backend, id } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    let release: () => void = () => {};
    const real = backend.api.changeStatus.bind(backend.api);
    vi.spyOn(backend.api, "changeStatus").mockImplementation(
      (req) =>
        new Promise((resolve, reject) => {
          release = () => real(req).then(resolve, reject);
        }),
    );

    let outcome: Promise<StatusOutcome> = Promise.resolve({ ok: true });
    act(() => {
      outcome = orders.changeStatus(id, "accept");
    });
    await flush();
    expect(orders.orders[0].status).toBe("pending"); // 아직 서버 응답 전
    expect(orders.inFlight[id]).toBe(true);
    expect(accepted).not.toHaveBeenCalled();

    release();
    await flush();

    await expect(outcome).resolves.toEqual({ ok: true });
    expect(orders.orders[0].status).toBe("preparing");
    expect(orders.inFlight[id]).toBeUndefined();
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it("접수 → 제조완료 → 픽업완료까지 표대로 간다", async () => {
    const { id } = await withOnePending();
    for (const [action, status] of [
      ["accept", "preparing"],
      ["complete", "ready"],
      ["pickup", "picked-up"],
    ] as const) {
      await act(async () => {
        await expect(orders.changeStatus(id, action)).resolves.toEqual({
          ok: true,
        });
      });
      expect(orders.orders[0].status).toBe(status);
    }
  });

  it("다른 PC가 먼저 처리했으면 서버의 최신 상태로 맞추고 문구를 돌려준다 (Q13)", async () => {
    const { backend, id } = await withOnePending();
    // 실시간 연결이 놓친 것처럼 서버에서만 바꾼다.
    vi.spyOn(backend.api, "changeStatus").mockResolvedValueOnce({
      kind: "already-handled",
      order: { ...orders.orders[0], status: "preparing", updatedAt: 9e15 },
    });

    let outcome: StatusOutcome | undefined;
    await act(async () => {
      outcome = await orders.changeStatus(id, "accept");
    });

    expect(outcome).toEqual({
      ok: false,
      reason: "already-handled",
      message: ORDER_MESSAGES.alreadyHandled,
    });
    expect(orders.orders[0].status).toBe("preparing");
  });

  it("서버가 too-late로 거절하면 상태를 바꾸지 않고 안내 문구를 돌려준다 (T18)", async () => {
    const { backend, id } = await withOnePending();
    for (const action of ["accept", "complete", "pickup"] as const) {
      await act(async () => {
        await orders.changeStatus(id, action);
      });
    }
    vi.spyOn(backend.api, "changeStatus").mockResolvedValueOnce({
      kind: "too-late",
      order: { ...orders.orders[0] },
    });

    let outcome: StatusOutcome | undefined;
    await act(async () => {
      outcome = await orders.changeStatus(id, "cancel", "영업 종료");
    });

    expect(outcome).toEqual({
      ok: false,
      reason: "too-late",
      message: ORDER_MESSAGES.tooLate,
    });
    expect(ORDER_MESSAGES.tooLate).toBe("취소할 수 있는 시간이 지났습니다.");
    expect(orders.orders[0].status).toBe("picked-up");
  });

  it("고객이 먼저 취소했으면 고객취소로 맞추고 문구를 돌려준다 (Q19)", async () => {
    const { backend, id } = await withOnePending();
    vi.spyOn(backend.api, "changeStatus").mockResolvedValueOnce({
      kind: "customer-cancelled",
      order: {
        ...orders.orders[0],
        status: "customer-cancelled",
        updatedAt: 9e15,
      },
    });

    let outcome: StatusOutcome | undefined;
    await act(async () => {
      outcome = await orders.changeStatus(id, "accept");
    });

    expect(outcome).toEqual({
      ok: false,
      reason: "customer-cancelled",
      message: ORDER_MESSAGES.customerCancelled,
    });
    expect(orders.orders[0].status).toBe("customer-cancelled");
    expect(orders.pendingOrderCount).toBe(0);
  });

  it("실패 · 다른 PC · 고객 취소 때는 '접수됨' 신호를 내지 않는다 (Q13: 누른 PC만 출력)", async () => {
    const { backend, id } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    const base = orders.orders[0];
    vi.spyOn(backend.api, "changeStatus")
      .mockResolvedValueOnce({
        kind: "already-handled",
        order: { ...base, status: "preparing", updatedAt: 9e15 },
      })
      .mockResolvedValueOnce({
        kind: "customer-cancelled",
        order: { ...base, status: "customer-cancelled", updatedAt: 9e15 + 1 },
      })
      .mockRejectedValueOnce(new Error("500"));

    await act(async () => {
      await orders.changeStatus(id, "accept");
    });
    expect(accepted).not.toHaveBeenCalled();
    // 두 번째 · 세 번째는 접수대기가 아니라 표가 거절하므로 서버 오류만 따로 확인한다.
    expect(orders.orders[0].status).toBe("preparing");
  });

  it("서버 오류일 때도 '접수됨' 신호를 내지 않는다", async () => {
    const { backend, id } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    vi.spyOn(backend.api, "changeStatus").mockRejectedValueOnce(
      new Error("500"),
    );

    await act(async () => {
      await orders.changeStatus(id, "accept");
    });

    expect(accepted).not.toHaveBeenCalled();
  });

  it("[주문취소] 사유를 서버 요청에 실어 보낸다 (Q17)", async () => {
    const { backend, id } = await withOnePending();
    const spy = vi.spyOn(backend.api, "changeStatus");

    await act(async () => {
      await orders.changeStatus(id, "cancel", "재료 소진");
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancel", reason: "재료 소진" }),
    );
    expect(orders.orders[0].status).toBe("store-cancelled");
  });

  it("서버 오류면 목록을 바꾸지 않고 실패 문구를 돌려준다 (Q51 ②)", async () => {
    const { backend, id } = await withOnePending();
    vi.spyOn(backend.api, "changeStatus").mockRejectedValueOnce(
      new Error("500"),
    );

    let outcome: StatusOutcome | undefined;
    await act(async () => {
      outcome = await orders.changeStatus(id, "accept");
    });

    expect(outcome).toEqual({
      ok: false,
      reason: "failed",
      message: ORDER_MESSAGES.failed,
    });
    expect(orders.orders[0].status).toBe("pending");
    expect(orders.inFlight[id]).toBeUndefined();
  });

  it("10초 안에 응답이 없으면 실패로 끝나고 목록은 그대로다", async () => {
    const { backend, id } = await withOnePending();
    vi.spyOn(backend.api, "changeStatus").mockReturnValue(
      new Promise(() => {}),
    );

    let outcome: StatusOutcome | undefined;
    act(() => {
      void orders.changeStatus(id, "accept").then((o) => (outcome = o));
    });
    await advance(9_999);
    expect(outcome).toBeUndefined();
    await advance(1);

    expect(outcome).toEqual({
      ok: false,
      reason: "failed",
      message: ORDER_MESSAGES.failed,
    });
    expect(orders.orders[0].status).toBe("pending");
  });

  it("시간 초과 뒤 다시 누르면 같은 멱등키로 보내, 서버가 늦게 처리했어도 '접수됨' 신호가 한 번 나간다 (스펙 3.3-1)", async () => {
    // 실시간 사건이 아직 안 온 경우(목록은 접수대기 그대로)를 만들려고 사건이 오지 않는 연결을 쓴다.
    const backend = createMockOrderBackend({ delayMs: 0 });
    const silentFeed: OrderFeed = { connect: async () => () => {} };
    await setup({ backend, feed: silentFeed });
    act(() => backend.dev.addOrders(1));
    await advance(POLL_MS);
    const id = orders.orders[0].orderId;
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    const real = backend.api.changeStatus.bind(backend.api);
    const spy = vi
      .spyOn(backend.api, "changeStatus")
      .mockImplementationOnce((req) => {
        void real(req); // 서버는 처리했지만 응답이 오지 않는다
        return new Promise(() => {});
      })
      .mockImplementation((req) => real(req));

    act(() => void orders.changeStatus(id, "accept"));
    await advance(10_000); // 시간 초과
    expect(accepted).not.toHaveBeenCalled();
    expect(orders.orders[0].status).toBe("pending");

    let outcome: StatusOutcome | undefined;
    await act(async () => {
      outcome = await orders.changeStatus(id, "accept");
    });

    expect(spy.mock.calls[1][0].idempotencyKey).toBe(
      spy.mock.calls[0][0].idempotencyKey,
    );
    expect(outcome).toEqual({ ok: true });
    expect(orders.orders[0].status).toBe("preparing");
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it("시간 초과 난 접수를 서버가 늦게 처리해 제조중으로 들어오면 같은 키로 한 번 더 물어 '접수됨' 신호를 한 번 낸다 (결정 A-1)", async () => {
    const { backend, id } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    const real = backend.api.changeStatus.bind(backend.api);
    const spy = vi
      .spyOn(backend.api, "changeStatus")
      .mockImplementationOnce((req) => {
        void real(req); // 서버는 처리했지만 응답이 오지 않는다 (실시간 사건은 온다)
        return new Promise(() => {});
      })
      .mockImplementation((req) => real(req));

    act(() => void orders.changeStatus(id, "accept"));
    await advance(10_000); // 시간 초과. 그 사이 실시간 사건으로 목록은 이미 제조중이다.
    await flush();

    expect(orders.orders[0].status).toBe("preparing");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toMatchObject({
      action: "accept",
      idempotencyKey: spy.mock.calls[0][0].idempotencyKey,
    });
    expect(accepted).toHaveBeenCalledTimes(1);

    // 이후 조회가 와도 다시 묻거나 신호를 또 내지 않는다.
    await advance(POLL_MS * 2);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it("다시 물어도 실패하면 기억을 남겨 다음 조회 때 다시 묻는다", async () => {
    const { backend, id } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    const real = backend.api.changeStatus.bind(backend.api);
    const spy = vi
      .spyOn(backend.api, "changeStatus")
      .mockImplementationOnce((req) => {
        void real(req);
        return new Promise(() => {});
      })
      .mockRejectedValueOnce(new Error("500"))
      .mockImplementation((req) => real(req));

    act(() => void orders.changeStatus(id, "accept"));
    await advance(10_000);
    await flush();
    expect(accepted).not.toHaveBeenCalled();

    await advance(POLL_MS);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(accepted).toHaveBeenCalledTimes(1);
  });

  it("다른 PC가 먼저 접수한 주문이면 다시 물어도 '접수됨' 신호를 내지 않는다 (Q13)", async () => {
    const { backend, id } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    vi.spyOn(backend.api, "changeStatus")
      .mockReturnValueOnce(new Promise(() => {})) // 서버는 이 요청을 못 받았다
      .mockImplementationOnce(async () => ({
        kind: "already-handled" as const,
        order: {
          ...orders.orders[0],
          status: "preparing" as const,
          updatedAt: 9e15,
        },
      }));

    act(() => void orders.changeStatus(id, "accept"));
    await advance(10_000);
    act(() => backend.dev.otherPcAcceptsOldestPending()); // 다른 PC가 접수 → 제조중으로 들어온다
    await flush();

    expect(orders.orders[0].status).toBe("preparing");
    expect(accepted).not.toHaveBeenCalled();
  });

  it("시간 초과 난 접수의 주문이 취소로 끝나면 다시 묻지 않는다", async () => {
    const { backend, id } = await withOnePending();
    const spy = vi
      .spyOn(backend.api, "changeStatus")
      .mockReturnValue(new Promise(() => {}));

    act(() => void orders.changeStatus(id, "accept"));
    await advance(10_000);
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();
    await advance(POLL_MS * 2);

    expect(orders.orders[0].status).toBe("customer-cancelled");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("접수 결과를 확인하는 동안 같은 주문의 다른 버튼은 막고, 그 사이 주문이 취소되면 늦게 온 ok로 '접수됨' 신호를 내지 않는다", async () => {
    const { backend, id } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    const real = backend.api.changeStatus.bind(backend.api);
    let resolveConfirm: (
      r: Awaited<ReturnType<typeof real>>,
    ) => void = () => {};
    vi.spyOn(backend.api, "changeStatus")
      .mockImplementationOnce((req) => {
        void real(req); // 서버는 처리했지만 응답이 오지 않는다
        return new Promise(() => {});
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveConfirm = resolve;
          }),
      )
      .mockImplementation((req) => real(req));

    act(() => void orders.changeStatus(id, "accept"));
    await advance(10_000); // 시간 초과 → 제조중으로 보이므로 결과 확인 시작
    await flush();
    expect(orders.inFlight[id]).toBe(true);
    let blocked: StatusOutcome | undefined;
    await act(async () => {
      blocked = await orders.changeStatus(id, "complete");
    });
    expect(blocked).toEqual({ ok: false, reason: "busy" });

    // 확인 응답이 오기 전에 주문이 끝났다 (예: 서버가 취소했다).
    await act(async () => {
      await real({
        orderId: id,
        action: "cancel",
        reason: "시험",
        idempotencyKey: "other",
      });
    });
    await flush();
    expect(orders.orders[0].status).toBe("store-cancelled");
    resolveConfirm({ kind: "ok", order: orders.orders[0] });
    await flush();

    expect(accepted).not.toHaveBeenCalled();
    expect(orders.inFlight[id]).toBeUndefined();
  });

  it("[새로고침]은 성공하면 true, 조회에 실패하면 false를 돌려준다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await orders.refresh();
    });
    expect(ok).toBe(true);

    vi.spyOn(backend.api, "fetchOrders").mockRejectedValue(new Error("500"));
    await act(async () => {
      ok = await orders.refresh();
    });
    expect(ok).toBe(false);
  });

  it("이미 다시 연결을 시도하는 중에 [새로고침]을 누르면 그 시도의 결과를 기다린다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });
    act(() => backend.dev.setConnected(false));
    await flush();
    act(() => backend.dev.setConnected(true));
    const real = backend.api.fetchOrders.bind(backend.api);
    let release: () => void = () => {};
    const fetchSpy = vi.spyOn(backend.api, "fetchOrders").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(real());
        }),
    );
    await advance(1000); // 타이머로 시작한 시도가 조회 응답을 기다리는 중

    let result: boolean | undefined;
    act(() => {
      void orders.refresh().then((ok) => (result = ok));
    });
    await flush();
    expect(result).toBeUndefined(); // 끝나기 전에는 실패로 단정하지 않는다
    release();
    await flush();

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // 같은 시도를 같이 쓴다
  });

  it("[주문취소]는 사유가 없거나 공백뿐이면 요청을 보내지 않는다 (결정 B-1)", async () => {
    const { backend, id } = await withOnePending();
    const spy = vi.spyOn(backend.api, "changeStatus");

    for (const reason of [undefined, "", "   "]) {
      let outcome: StatusOutcome | undefined;
      await act(async () => {
        // 타입이 막는 호출이라 일부러 우회해 실행 시점 방어를 확인한다.
        outcome = await (
          orders.changeStatus as (
            id: string,
            action: "cancel",
            reason?: string,
          ) => Promise<StatusOutcome>
        )(id, "cancel", reason);
      });
      expect(outcome).toEqual({ ok: false, reason: "not-allowed" });
    }

    expect(spy).not.toHaveBeenCalled();
    expect(orders.orders[0].status).toBe("pending");
  });

  it("사유 앞뒤 공백은 지우고 보낸다", async () => {
    const { backend, id } = await withOnePending();
    const spy = vi.spyOn(backend.api, "changeStatus");

    await act(async () => {
      await orders.changeStatus(id, "cancel", "  재료 소진  ");
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "cancel", reason: "재료 소진" }),
    );
  });

  it("사유 없는 [주문취소] 호출은 타입 검사에서 막힌다", () => {
    // 컴파일 시점 확인용: 아래 호출은 타입 오류여야 한다 (실행하지 않는다).
    const never = () => {
      // @ts-expect-error 취소는 사유가 필요하다
      void orders.changeStatus("o1", "cancel");
      // @ts-expect-error 취소가 아닌 동작은 사유를 받지 않는다
      void orders.changeStatus("o1", "accept", "사유");
    };
    expect(never).toBeTypeOf("function");
  });

  it("확정 응답을 받은 뒤의 다음 누름은 새 멱등키를 쓴다", async () => {
    const { backend, id } = await withOnePending();
    const spy = vi.spyOn(backend.api, "changeStatus");
    await act(async () => {
      await orders.changeStatus(id, "accept");
      await orders.changeStatus(id, "complete");
    });
    expect(spy.mock.calls[0][0].idempotencyKey).not.toBe(
      spy.mock.calls[1][0].idempotencyKey,
    );
  });

  it("새 주문 · 접수 신호를 받는 쪽이 예외를 던져도 수신과 요청 결과는 그대로다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });
    orders.onNewOrder(() => {
      throw new Error("구독자 오류");
    });
    const second = vi.fn();
    orders.onNewOrder(second);
    orders.onAccepted(() => {
      throw new Error("구독자 오류");
    });

    act(() => backend.dev.addOrders(2));
    await flush();

    expect(orders.orders).toHaveLength(2);
    expect(second).toHaveBeenCalledTimes(2);
    await act(async () => {
      await expect(
        orders.changeStatus(orders.orders[0].orderId, "accept"),
      ).resolves.toEqual({ ok: true });
    });
    expect(orders.connection).toBe("connected");
  });

  it("같은 주문을 두 번 누르면 요청은 한 번만 나간다 (3.3-3)", async () => {
    const { backend, id } = await withOnePending();
    const real = backend.api.changeStatus.bind(backend.api);
    const spy = vi
      .spyOn(backend.api, "changeStatus")
      .mockImplementation((req) => real(req));

    let second: StatusOutcome | undefined;
    await act(async () => {
      const first = orders.changeStatus(id, "accept");
      second = await orders.changeStatus(id, "accept");
      await first;
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ ok: false, reason: "busy" });
  });

  it("표에 없는 변경은 서버로 보내지 않는다", async () => {
    const { backend, id } = await withOnePending();
    const spy = vi.spyOn(backend.api, "changeStatus");

    let outcome: StatusOutcome | undefined;
    await act(async () => {
      outcome = await orders.changeStatus(id, "pickup"); // 접수대기에서 픽업완료는 불가
    });

    expect(outcome).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("[픽업완료]는 즉시 보내고, 5초 안 [완료 취소]는 되돌리기 요청을 보낸다 (11장 F)", async () => {
    const { backend, id } = await withOnePending();
    const spy = vi.spyOn(backend.api, "changeStatus");
    for (const action of ["accept", "complete", "pickup"] as const) {
      await act(async () => {
        await orders.changeStatus(id, action);
      });
    }
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "pickup" }),
    );

    await advance(4_000);
    await act(async () => {
      await expect(orders.changeStatus(id, "undo-pickup")).resolves.toEqual({
        ok: true,
      });
    });

    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: "undo-pickup" }),
    );
    expect(orders.orders[0].status).toBe("ready");
  });

  it("5초가 지나면 [완료 취소]를 받지 않는다", async () => {
    const { backend, id } = await withOnePending();
    for (const action of ["accept", "complete", "pickup"] as const) {
      await act(async () => {
        await orders.changeStatus(id, action);
      });
    }
    const spy = vi.spyOn(backend.api, "changeStatus");
    await advance(5_001);

    let outcome: StatusOutcome | undefined;
    await act(async () => {
      outcome = await orders.changeStatus(id, "undo-pickup");
    });

    expect(outcome).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(spy).not.toHaveBeenCalled();
    expect(orders.orders[0].status).toBe("picked-up");
  });

  it("고객이 접수대기 주문을 취소하면 실시간으로 반영한다", async () => {
    const { backend } = await withOnePending();
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();

    expect(orders.orders[0].status).toBe("customer-cancelled");
    expect(orders.pendingOrderCount).toBe(0);
  });

  it("다른 PC가 접수하면 '접수됨' 신호 없이 상태만 맞춘다 (Q13: 누른 PC만 출력)", async () => {
    const { backend } = await withOnePending();
    const accepted = vi.fn();
    orders.onAccepted(accepted);
    act(() => backend.dev.otherPcAcceptsOldestPending());
    await flush();

    expect(orders.orders[0].status).toBe("preparing");
    expect(accepted).not.toHaveBeenCalled();
  });
});

describe("요청 10초 제한: 수신 쪽 요청 (완료 기준 6)", () => {
  it("간격은 스펙 값이다: 연결 신호 15초 · 재조회 30초", () => {
    expect(HEARTBEAT_MS).toBe(15_000);
    expect(POLL_MS).toBe(30_000);
  });

  it("연결 신호가 응답 없이 멈추면 10초 뒤 실패로 세고, 연달아 2번이면 끊긴 것으로 본다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const { sound } = await setup({ backend });
    vi.spyOn(backend.api, "sendHeartbeat").mockReturnValue(
      new Promise(() => {}),
    );

    await advance(HEARTBEAT_MS + 9_999);
    await advance(1); // 첫 실패
    expect(sound.playWarning).not.toHaveBeenCalled();
    await advance(HEARTBEAT_MS - 1); // 두 번째 신호(30초)는 40초에 실패한다
    expect(sound.playWarning).not.toHaveBeenCalled();
    await advance(1);

    // 연달아 2번 실패: 끊긴 것으로 보고 경고음 한 번 (모의 서버는 멀쩡하므로 곧 다시 연결된다)
    expect(sound.playWarning).toHaveBeenCalledTimes(1);
  });

  it("처음 조회가 응답 없이 멈추면 10초 뒤 다시 연결 중이 된다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    vi.spyOn(backend.api, "fetchOrders").mockReturnValue(new Promise(() => {}));
    await setup({ backend });
    expect(orders.connection).toBe("connected");

    await advance(10_000);

    expect(orders.connection).toBe("reconnecting");
  });

  it("다시 연결할 때 연결이 응답 없이 멈추면 10초 뒤 실패로 보고 다음 시도를 예약한다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    let connects = 0;
    let closeFeed: () => void = () => {};
    const feed: OrderFeed = {
      connect: ({ onClose }) => {
        connects += 1;
        if (connects === 1) {
          closeFeed = onClose;
          return Promise.resolve(() => {});
        }
        return new Promise(() => {}); // 이후 시도는 응답이 없다
      },
    };
    await setup({ backend, feed });
    act(() => closeFeed());
    await advance(1000); // 첫 시도 시작
    expect(connects).toBe(2);

    await advance(10_000); // 시간 초과 → 2초 뒤 다음 시도
    expect(connects).toBe(2);
    await advance(2_000);

    expect(connects).toBe(3);
  });
});

describe("연결 상태 (스펙 3.4)", () => {
  it("끊기면 빨간 띠 상태 + 경고음 한 번, 다시 연결되면 전체 재조회와 직전 주문받기 상태 복구 (완료 기준 2 · 4)", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const { sound, newOrders } = await setup({ backend });
    await act(async () => shell.actions.requestAccepting(true));
    await flush();
    expect(shell.state.accepting).toBe(true);

    act(() => backend.dev.setConnected(false));
    await flush();

    expect(orders.connection).toBe("reconnecting");
    expect(sound.playWarning).toHaveBeenCalledTimes(1);

    act(() => backend.dev.addOrders(2)); // 끊긴 동안 결제된 주문 (서버가 보관)
    await advance(1000); // 첫 시도: 아직 끊겨 있다
    expect(orders.connection).toBe("reconnecting");
    expect(sound.playWarning).toHaveBeenCalledTimes(1);

    act(() => backend.dev.setConnected(true));
    await advance(2000); // 두 번째 시도

    expect(orders.connection).toBe("connected");
    expect(orders.orders).toHaveLength(2);
    expect(newOrders).toHaveLength(2);
    expect(shell.state.accepting).toBe(true); // 직전 상태 (Q51 · Q53)
    expect(sound.playWarning).toHaveBeenCalledTimes(1);
  });

  it("다시 연결하는 도중 실시간 연결이 또 끊기면 연결됨으로 돌리지 않고 다시 시도한다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const closers: Array<() => void> = [];
    const feed: OrderFeed = {
      connect: async ({ onClose }) => {
        closers.push(onClose);
        return () => {};
      },
    };
    await setup({ backend, feed });
    const real = backend.api.fetchOrders.bind(backend.api);
    let release: () => void = () => {};
    vi.spyOn(backend.api, "fetchOrders").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(real());
        }),
    );

    act(() => closers[0]()); // 끊김 → 다시 연결 중
    await flush();
    await advance(1000); // 첫 시도: 연결은 열었고 조회 응답을 기다리는 중
    expect(closers).toHaveLength(2);
    act(() => closers[1]()); // 그 사이 실시간 연결이 또 끊김
    release();
    await flush();

    expect(orders.connection).toBe("reconnecting");

    await advance(2000); // 한 번 실패했으니 간격 2초
    expect(closers).toHaveLength(3);
    release();
    await flush();

    expect(orders.connection).toBe("connected");
  });

  it("끊긴 동안 서버의 주문받기가 바뀌었으면 다시 연결 뒤 헤더에 반영한다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });
    await act(async () => shell.actions.requestAccepting(true));
    await flush();
    expect(shell.state.accepting).toBe(true);
    // 다른 PC가 껐지만 실시간 사건은 놓쳤다 (앱 헤더는 ON 그대로).
    await backend.storeStatusApi.setAcceptingOrders(false);
    expect(shell.state.accepting).toBe(true);

    act(() => backend.dev.setConnected(false));
    await flush();
    act(() => backend.dev.setConnected(true));
    await advance(1000);

    expect(orders.connection).toBe("connected");
    expect(shell.state.accepting).toBe(false);
  });

  it("다시 연결 간격은 1초 → 2초 → 4초 …로 늘고 최대 30초다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    let attempts = 0;
    let closeFeed: () => void = () => {};
    const feed: OrderFeed = {
      connect: async ({ onClose }) => {
        attempts += 1;
        if (attempts > 1) throw new Error("연결 실패");
        closeFeed = onClose;
        return () => {};
      },
    };
    await setup({ backend, feed });
    expect(attempts).toBe(1);
    act(() => closeFeed());
    await flush();

    const at: number[] = [];
    let elapsed = 0;
    let last = attempts;
    while (elapsed < 140_000 && at.length < 9) {
      await advance(500);
      elapsed += 500;
      if (attempts !== last) {
        at.push(elapsed);
        last = attempts;
      }
    }
    // 끊긴 시각 0 기준: 1초, +2초, +4초, +8초, +16초, +30초, +30초 …
    expect(at.slice(0, 7)).toEqual([
      1000, 3000, 7000, 15000, 31000, 61000, 91000,
    ]);
  });

  it("연결 신호가 연달아 2번 실패하면 끊긴 것으로 본다. 한 번만 실패하면 아니다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const hb = vi
      .spyOn(backend.api, "sendHeartbeat")
      .mockRejectedValueOnce(new Error("실패"));
    const { sound } = await setup({ backend });

    await advance(HEARTBEAT_MS);
    expect(orders.connection).toBe("connected");
    await advance(HEARTBEAT_MS); // 두 번째는 성공
    expect(hb).toHaveBeenCalledTimes(2);
    expect(orders.connection).toBe("connected");

    hb.mockRejectedValue(new Error("실패"));
    await advance(HEARTBEAT_MS);
    expect(orders.connection).toBe("connected");
    await advance(HEARTBEAT_MS);
    expect(orders.connection).toBe("reconnecting");
    expect(sound.playWarning).toHaveBeenCalledTimes(1);
  });

  it("조회도 연달아 실패하면 끊긴 것으로 본다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });
    vi.spyOn(backend.api, "fetchOrders").mockRejectedValue(new Error("실패"));
    vi.spyOn(backend.api, "sendHeartbeat").mockResolvedValue();

    // 조회는 30초마다 한 번이므로 [새로고침] 한 번 + 30초 조회 한 번이 연달아 실패한다.
    await act(async () => {
      await orders.refresh();
    });
    expect(orders.connection).toBe("connected");
    await advance(POLL_MS);

    expect(orders.connection).toBe("reconnecting");
  });

  it("처음부터 연결하지 못하면 바로 다시 연결 중이 되고, 연결되면 첫 조회는 신호 없이 채운다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(2);
    backend.dev.setConnected(false);
    const { sound, newOrders } = await setup({ backend });
    expect(orders.connection).toBe("reconnecting");
    expect(sound.playWarning).toHaveBeenCalledTimes(1);

    act(() => backend.dev.setConnected(true));
    await advance(1000);

    expect(orders.connection).toBe("connected");
    expect(orders.orders).toHaveLength(2);
    expect(newOrders).toHaveLength(0);
  });

  it("다시 연결 중에 [새로고침]을 누르면 기다리지 않고 지금 다시 시도한다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });
    act(() => backend.dev.setConnected(false));
    await flush();
    act(() => backend.dev.setConnected(true));

    await act(async () => {
      await orders.refresh();
    });

    expect(orders.connection).toBe("connected");
  });
});

describe("주문받기 (스펙 3.5)", () => {
  it("서버가 자동으로 끄면 확인창 없이 OFF로 바꾸고 빨간 띠 상태 + 알림음 한 번, 켜면 띠가 사라진다 (완료 기준 5)", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const { sound } = await setup({ backend });
    await act(async () => shell.actions.requestAccepting(true));
    await flush();
    expect(shell.state.accepting).toBe(true);

    act(() => backend.dev.triggerAutoOff());
    await flush();

    expect(shell.state.accepting).toBe(false);
    expect(shell.state.dialog).toBeNull();
    expect(shell.state.autoOffBanner).toBe(true);
    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);

    await act(async () => shell.actions.requestAccepting(true));
    await flush();

    expect(shell.state.accepting).toBe(true);
    expect(shell.state.autoOffBanner).toBe(false);
  });

  it("다른 PC가 주문받기를 바꾸면 확인창 없이 헤더에 반영한다", async () => {
    let emit: (e: OrderEvent) => void = () => {};
    const feed: OrderFeed = {
      connect: async ({ onEvent }) => {
        emit = onEvent;
        return () => {};
      },
    };
    const { sound } = await setup({ feed });

    act(() =>
      emit({ eventId: "a1", type: "accepting-changed", accepting: true }),
    );

    expect(shell.state.accepting).toBe(true);
    expect(shell.state.autoOffBanner).toBe(false);
    expect(sound.playNewOrder).not.toHaveBeenCalled();
  });

  it("같은 자동 OFF 사건이 다시 와도 알림음은 한 번이다", async () => {
    let emit: (e: OrderEvent) => void = () => {};
    const feed: OrderFeed = {
      connect: async ({ onEvent }) => {
        emit = onEvent;
        return () => {};
      },
    };
    const { sound } = await setup({ feed });
    const off: OrderEvent = {
      eventId: "a2",
      type: "accepting-changed",
      accepting: false,
      reason: "auto-cancel-streak",
    };

    act(() => {
      emit(off);
      emit(off);
    });

    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);
  });

  it("로그인했을 때 서버가 ON이면 OFF 요청을 보내 맞춘다 (11장 J)", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await backend.storeStatusApi.setAcceptingOrders(true);

    await setup({ backend });

    expect(backend.dev.isAccepting()).toBe(false);
    expect(shell.state.accepting).toBe(false);
  });

  it("처음 맞추는 사이 점원이 주문받기를 켜도 헤더와 서버가 어긋나지 않는다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    // 서버가 ON으로 시작하는 점포. 조회가 끝나기 전에 점원이 켠 것을 흉내 낸다.
    await backend.storeStatusApi.setAcceptingOrders(true);
    const real = backend.api.getAcceptingOrders.bind(backend.api);
    vi.spyOn(backend.api, "getAcceptingOrders").mockImplementationOnce(
      async () => {
        shell.actions.requestAccepting(true);
        await Promise.resolve();
        return real();
      },
    );

    await setup({ backend });
    await flush();

    expect(backend.dev.isAccepting()).toBe(false);
    expect(shell.state.accepting).toBe(false);
  });

  it("주문받기 상태를 맞추는 요청만 실패해도 인터넷 끊김으로 보지 않고, 다음 조회 때 다시 맞춘다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    await backend.storeStatusApi.setAcceptingOrders(true);
    vi.spyOn(backend.api, "getAcceptingOrders").mockRejectedValueOnce(
      new Error("실패"),
    );
    const { sound } = await setup({ backend });

    expect(orders.connection).toBe("connected");
    expect(sound.playWarning).not.toHaveBeenCalled();
    expect(backend.dev.isAccepting()).toBe(true);

    await advance(POLL_MS);

    expect(backend.dev.isAccepting()).toBe(false);
  });

  it("로그인 전에는 수신을 시작하지 않는다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const fetch = vi.spyOn(backend.api, "fetchOrders");
    await setup({ backend, session: null });

    expect(fetch).not.toHaveBeenCalled();
    expect(orders.orders).toHaveLength(0);
  });
});

describe("로그 (스펙 7장)", () => {
  it("주문은 orderId로만 남기고 고객 정보는 남기지 않는다", async () => {
    const logs: string[] = [];
    const log = await import("../log/log");
    vi.spyOn(log, "logInfo").mockImplementation(async (m: string) => {
      logs.push(m);
    });
    const backend = createMockOrderBackend({ delayMs: 0 });
    await setup({ backend });
    act(() => backend.dev.addOrders(1));
    await flush();
    await act(async () => {
      await orders.changeStatus(orders.orders[0].orderId, "accept");
    });

    expect(logs).toContain("주문 수신 시작");
    expect(logs).toContain(
      `주문 상태 변경: ${orders.orders[0].orderId}, 접수, 성공`,
    );
    const all = logs.join("\n");
    expect(all).not.toContain("홍*동");
    expect(all).not.toContain("0000");
  });
});
