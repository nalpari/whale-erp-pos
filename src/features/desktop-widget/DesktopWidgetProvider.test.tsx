// 본 창 쪽 위젯 연결: 알림음 · 뜨는 조건 · 30초 반복 · 위젯에서 온 동작 (T06 스펙 3.2 · 3.4, 7장 1~4).
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockOrderFeed } from "../../shared/api/order-feed";
import { createMockOrderBackend } from "../../shared/api/orders";
import { createFakeLogApi } from "../../shared/log/log-api";
import { OrdersProvider } from "../../shared/orders/OrdersProvider";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../../shared/printer/printer-api";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import {
  ALERT_REPEAT_MS,
  type SoundPlayer,
} from "../../shared/sound/sound-player";
import { createFakeWindow } from "../../test/fakes";
import { AppShell } from "../app-shell/AppShell";
import { AppShellProvider } from "../app-shell/AppShellContext";
import { WidgetSettingsProvider } from "../settings-widget/WidgetSettingsContext";
import { WIDGET_RETRY_MAX, WIDGET_RETRY_MS } from "./retry";
import { DesktopWidgetProvider } from "./DesktopWidgetProvider";
import type { WidgetHost } from "./widget-host";
import type { WidgetCommand, WidgetView } from "./widget-protocol";

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

function setup(front: boolean, options: { listenFails?: boolean } = {}) {
  const backend = createMockOrderBackend({ delayMs: 0 });
  const sound: SoundPlayer = { playNewOrder: vi.fn(), playWarning: vi.fn() };
  const state = { front };
  let handler: ((c: WidgetCommand) => void) | null = null;
  const views: WidgetView[] = [];
  const host: WidgetHost = {
    isMainFront: vi.fn(async () => state.front),
    bringMainToFront: vi.fn(async () => {}),
    publish: vi.fn(async (v) => void views.push(v)),
    onCommand: vi.fn(async (h) => {
      if (options.listenFails) throw new Error("listen 실패");
      handler = h;
      return () => {};
    }),
  };
  render(
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={backend.storeStatusApi}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={createMemoryTokenStore()}
      printerApi={createFakePrinterApi()}
      printerSettingsStore={createMemoryPrinterSettingsStore()}
      logApi={createFakeLogApi()}
      initialSession={STORE}
    >
      <OrdersProvider
        orderApi={backend.api}
        orderFeed={createMockOrderFeed(backend)}
        storeStatusApi={backend.storeStatusApi}
        sound={sound}
      >
        <WidgetSettingsProvider sound={sound}>
          <DesktopWidgetProvider host={host}>
            <AppShell />
          </DesktopWidgetProvider>
        </WidgetSettingsProvider>
      </OrdersProvider>
    </AppShellProvider>,
  );
  return {
    backend,
    sound,
    host,
    state,
    view: () => views[views.length - 1],
    send: async (c: WidgetCommand) => {
      await act(async () => {
        handler?.(c);
        await vi.advanceTimersByTimeAsync(0);
      });
    },
  };
}

const flush = () =>
  act(async () => void (await vi.advanceTimersByTimeAsync(0)));
const advance = (ms: number) =>
  act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("뜨는 조건 (3.2)", () => {
  it("본 창이 앞이면 알림음만 낸다", async () => {
    const t = setup(true);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(1);
    expect(t.view().visible).toBe(false);
  });

  it("본 창이 앞이 아니면 위젯을 띄우고, 같은 순간 여러 건이어도 소리는 한 번이다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(3));
    await flush();
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(1);
    expect(t.view().visible).toBe(true);
    expect(t.view().cards).toHaveLength(3);
  });

  it("위젯이 떠 있는데 본 창이 앞으로 와도 그대로 두고, 카드만 더한다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    t.state.front = true;
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.view().visible).toBe(true);
    expect(t.view().cards).toHaveLength(2);
  });
});

describe("30초 반복 (2장)", () => {
  it("접수대기가 있으면 30초마다 울리고, 모두 처리하면 멈춘다", async () => {
    const t = setup(true);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(1);
    await advance(ALERT_REPEAT_MS);
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(2);
    await advance(ALERT_REPEAT_MS);
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(3);

    await t.send({ type: "action", orderId: "mock-order-1", action: "accept" });
    await advance(ALERT_REPEAT_MS * 3);
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(3);
  });

  it("본 창이 앞이 아니면 반복 때 닫은 위젯과 접수대기 카드를 다시 띄운다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(2));
    await flush();
    await t.send({ type: "close-card", orderId: "mock-order-1" });
    expect(t.view().cards).toHaveLength(1);
    await t.send({ type: "close-all" });
    expect(t.view().visible).toBe(false);

    await advance(ALERT_REPEAT_MS);
    expect(t.view().visible).toBe(true);
    expect(t.view().cards).toHaveLength(2);
  });

  it("본 창이 앞이면 반복 때 위젯은 띄우지 않는다", async () => {
    const t = setup(true);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    await advance(ALERT_REPEAT_MS);
    expect(t.view().visible).toBe(false);
  });
});

describe("카드 [×] · 머리 [×] (3.4)", () => {
  it("제조중 카드를 닫으면 반복이 와도 다시 뜨지 않고, 머리 [×] 뒤 새 주문에는 다시 뜬다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(2));
    await flush();
    await t.send({ type: "action", orderId: "mock-order-1", action: "accept" });
    await t.send({ type: "close-card", orderId: "mock-order-1" });
    await advance(ALERT_REPEAT_MS);
    expect(t.view().cards.map((c) => c.orderId)).toEqual(["mock-order-2"]);

    await t.send({ type: "close-all" });
    expect(t.view().visible).toBe(false);
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.view().visible).toBe(true);
  });
});

describe("위젯에서 처리 (3.4, 7장 3)", () => {
  it("[주문접수]하면 위젯 카드도 본 창 카드도 제조중으로 바뀐다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    await t.send({ type: "action", orderId: "mock-order-1", action: "accept" });
    expect(t.view().cards[0].status).toBe("preparing");
    expect(screen.getByLabelText("픽업번호 1")).toHaveTextContent("제조중");
  });

  it("[픽업완료] 뒤 5초 동안 「완료 취소」 카드가 남고, [완료 취소]하면 제조완료로 돌아온다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    for (const action of ["accept", "complete", "pickup"] as const) {
      await t.send({ type: "action", orderId: "mock-order-1", action });
    }
    expect(t.view().cards[0]).toMatchObject({ status: "picked-up" });
    expect(t.view().visible).toBe(true);

    await t.send({
      type: "action",
      orderId: "mock-order-1",
      action: "undo-pickup",
    });
    expect(t.view().cards[0].status).toBe("ready");
  });

  it("[완료 취소]를 안 누르면 5초 뒤 카드가 사라지고 위젯도 숨는다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    for (const action of ["accept", "complete", "pickup"] as const) {
      await t.send({ type: "action", orderId: "mock-order-1", action });
    }
    await advance(5000);
    expect(t.view().cards).toHaveLength(0);
    expect(t.view().visible).toBe(false);
  });

  it("실패하면 그 카드에 「#번호 …」 문구를 3초 보인다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    await t.send({ type: "action", orderId: "mock-order-1", action: "accept" });
    // 서버가 끊긴 상태의 요청은 실패한다.
    act(() => t.backend.dev.setConnected(false));
    await t.send({
      type: "action",
      orderId: "mock-order-1",
      action: "complete",
    });
    expect(t.view().cards[0].failure).toBe(
      "#1 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
    await advance(3000);
    expect(t.view().cards[0].failure).toBeUndefined();
  });

  it("[주문취소]는 본 창을 앞으로 가져와 취소 사유 팝업을 연다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    await t.send({ type: "cancel", orderId: "mock-order-1" });
    expect(t.host.bringMainToFront).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("카드를 누르면 본 창을 앞으로 가져와 그 주문의 요약 팝업을 연다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    await t.send({ type: "open", orderId: "mock-order-1" });
    expect(t.host.bringMainToFront).toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("자동 OFF 안내 카드 (Q54)", () => {
  it("본 창이 앞이 아니면 카드가 뜨고, [×]로 닫으면 다시 뜨지 않는다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.triggerAutoOff());
    await flush();
    expect(t.view()).toMatchObject({ visible: true, autoOffCard: true });

    await t.send({ type: "auto-off-close" });
    expect(t.view().visible).toBe(false);
    await advance(ALERT_REPEAT_MS);
    expect(t.view().autoOffCard).toBe(false);
  });
});

describe("안전장치 · 연결 분기 (③ 리뷰)", () => {
  it("본 창이 앞인지 못 읽으면 놓치지 않으려고 위젯을 띄운다", async () => {
    const t = setup(true);
    await flush();
    vi.mocked(t.host.isMainFront).mockRejectedValue(new Error("창 정보 없음"));
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.view().visible).toBe(true);
  });

  it("카드가 0장이 돼 숨은 뒤 본 창이 앞일 때 새 주문이 오면 위젯은 뜨지 않는다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    for (const action of ["accept", "complete", "pickup"] as const) {
      await t.send({ type: "action", orderId: "mock-order-1", action });
    }
    await advance(5000);
    expect(t.view().visible).toBe(false);
    t.state.front = true;
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.view().visible).toBe(false);
  });

  it("로그아웃하면 위젯이 숨고 30초 반복도 멈춘다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.view().visible).toBe(true);
    const before = vi.mocked(t.sound.playNewOrder).mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "로그아웃" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
    await flush();
    expect(t.view().visible).toBe(false);
    await advance(ALERT_REPEAT_MS * 2);
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(before);
  });

  it("새 주문이 오면 30초 반복을 그때부터 다시 센다", async () => {
    const t = setup(true);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    await advance(29_000);
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(2);
    await advance(1000);
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(2);
    await advance(ALERT_REPEAT_MS);
    expect(t.sound.playNewOrder).toHaveBeenCalledTimes(3);
  });

  it("다른 탭에 있어도 카드를 누르면 주문접수 탭에서 그 주문의 요약 팝업을 연다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(2));
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
    await t.send({ type: "open", orderId: "mock-order-2" });
    expect(screen.getByRole("tab", { name: "주문접수" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("#2");
  });

  it("위젯 카드를 두 번째 눌러도(첫 요청 처리 뒤) 다시 열린다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(2));
    await flush();
    await t.send({ type: "open", orderId: "mock-order-1" });
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await t.send({ type: "open", orderId: "mock-order-2" });
    expect(screen.getByRole("dialog")).toHaveTextContent("#2");
  });

  it("「+ N건 더 있음」은 주문접수 첫 탭만 열고 팝업은 열지 않는다", async () => {
    const t = setup(false);
    await flush();
    fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
    await t.send({ type: "more" });
    expect(t.host.bringMainToFront).toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "주문접수" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[완료 취소]가 5초 끝에 거절되면 문구를 보인다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    for (const action of ["accept", "complete", "pickup"] as const) {
      await t.send({ type: "action", orderId: "mock-order-1", action });
    }
    vi.setSystemTime(Date.now() + 6000); // 5초가 지난 뒤 누른다 (타이머는 아직 안 돈 순간)
    await t.send({
      type: "action",
      orderId: "mock-order-1",
      action: "undo-pickup",
    });
    expect(t.view().cards[0]?.failure).toContain("#1");
  });

  it("[픽업완료]가 실패하면 보통 카드로 돌아온다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    for (const action of ["accept", "complete"] as const) {
      await t.send({ type: "action", orderId: "mock-order-1", action });
    }
    act(() => t.backend.dev.setConnected(false));
    await t.send({ type: "action", orderId: "mock-order-1", action: "pickup" });
    expect(t.view().cards[0]).toMatchObject({ status: "ready" });
    expect(t.view().cards[0].undoExpiresAt).toBeUndefined();
  });

  it("자동 OFF: 본 창이 앞이면 위젯이 뜨지 않는다", async () => {
    const t = setup(true);
    await flush();
    act(() => t.backend.dev.triggerAutoOff());
    await flush();
    expect(t.view().visible).toBe(false);
  });

  it("다른 PC가 처리해 취소할 수 없게 되면 취소 사유 팝업이 닫힌다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    await t.send({ type: "cancel", orderId: "mock-order-1" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => t.backend.dev.customerCancelsOldestPending());
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("연결 실패 · 취소 불가 안내 (사용자 결정 A-2 · B-2)", () => {
  it("동작 받기 등록이 계속 실패하면 다시 시도하다가 위젯에 「본 화면에서 처리해 주세요」를 알린다", async () => {
    const t = setup(false, { listenFails: true });
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.view().linkFailed).toBe(false);
    await advance(WIDGET_RETRY_MS * (WIDGET_RETRY_MAX + 1));
    expect(t.host.onCommand).toHaveBeenCalledTimes(WIDGET_RETRY_MAX + 1);
    expect(t.view()).toMatchObject({ visible: true, linkFailed: true });
  });

  it("[주문취소] 때 이미 처리된 주문이면 본 창을 앞으로 가져온 뒤 「#번호 …」 토스트를 보인다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    act(() => t.backend.dev.customerCancelsOldestPending());
    await flush();
    await t.send({ type: "cancel", orderId: "mock-order-1" });
    expect(t.host.bringMainToFront).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(
      screen.getByText("#1 다른 PC에서 이미 처리한 주문입니다."),
    ).toBeVisible();
  });

  it("목록에서 사라진 주문이면 번호 없이 원문만 보인다", async () => {
    const t = setup(false);
    await flush();
    await t.send({ type: "cancel", orderId: "없는-주문" });
    expect(screen.getByRole("status")).toHaveTextContent(
      "다른 PC에서 이미 처리한 주문입니다.",
    );
    expect(screen.getByRole("status").textContent).not.toContain("#");
  });
});

describe("환경설정 반영 (T10)", () => {
  it("저장된 위치를 위젯 화면에 담아 보낸다 (기본은 오른쪽 아래)", async () => {
    localStorage.setItem(
      "widgetSettings",
      JSON.stringify({
        showPreparing: true,
        showReady: true,
        position: "top-left",
        volume: 40,
      }),
    );
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(1));
    await flush();
    expect(t.view().position).toBe("top-left");
  });

  it("제조중을 끄면 접수한 주문 카드는 사라지고 접수대기는 늘 보인다", async () => {
    localStorage.setItem(
      "widgetSettings",
      JSON.stringify({
        showPreparing: false,
        showReady: true,
        position: "bottom-right",
        volume: 40,
      }),
    );
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(2));
    await flush();
    expect(t.view().cards).toHaveLength(2);
    act(() => t.backend.dev.otherPcAcceptsOldestPending());
    await flush();
    expect(t.view().cards.map((c) => c.status)).toEqual(["pending"]);
  });

  it("실행 중에 환경설정을 바꾸면 이미 뜬 위젯 화면이 바로 바뀐다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(2));
    await flush();
    act(() => t.backend.dev.otherPcAcceptsOldestPending());
    await flush();
    expect(t.view().cards.map((c) => c.status)).toEqual([
      "pending",
      "preparing",
    ]);
    expect(t.view().position).toBe("bottom-right");

    fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "제조중" }));
    fireEvent.click(screen.getByRole("radio", { name: "좌상단" }));
    await flush();

    expect(t.view().cards.map((c) => c.status)).toEqual(["pending"]);
    expect(t.view().position).toBe("top-left");
  });

  it("[전체 주문 삭제] 뒤에는 위젯 · 30초 반복이 빈 목록을 따른다", async () => {
    const t = setup(false);
    await flush();
    act(() => t.backend.dev.addOrders(2));
    await flush();
    expect(t.view().visible).toBe(true);
    act(() => t.backend.dev.deleteAllOrders());
    await flush();
    expect(t.view().visible).toBe(false);
    vi.mocked(t.sound.playNewOrder).mockClear();
    await advance(ALERT_REPEAT_MS * 2);
    expect(t.sound.playNewOrder).not.toHaveBeenCalled();
  });
});
