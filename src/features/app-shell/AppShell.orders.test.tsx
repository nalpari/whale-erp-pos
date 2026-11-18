// 주문 수신(T03)과 프로그램 틀이 이어지는 곳: 빨간 띠 · [새로고침] · 확인창 건수 · 10초 시간 제한.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockOrderFeed } from "../../shared/api/order-feed";
import { createMockOrderBackend } from "../../shared/api/orders";
import type { StoreStatusApi } from "../../shared/api/store-status";
import { createFakeLogApi } from "../../shared/log/log-api";
import {
  AUTO_OFF_BANNER,
  CONNECTION_LOST_BANNER,
} from "../../shared/orders/order-texts";
import { OrdersProvider } from "../../shared/orders/OrdersProvider";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../../shared/printer/printer-api";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import { createNoopSoundPlayer } from "../../shared/sound/sound-player";
import { createFakeWindow } from "../../test/fakes";
import { AppShell } from "./AppShell";
import { AppShellProvider } from "./AppShellContext";

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

function renderApp(
  backend = createMockOrderBackend({ delayMs: 0 }),
  storeStatusApi: StoreStatusApi = backend.storeStatusApi,
) {
  const fakeWindow = createFakeWindow();
  render(
    <AppShellProvider
      windowApi={fakeWindow.win}
      storeStatusApi={storeStatusApi}
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
        storeStatusApi={storeStatusApi}
        sound={createNoopSoundPlayer()}
      >
        <AppShell />
      </OrdersProvider>
    </AppShellProvider>,
  );
  return { backend, fakeWindow };
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("빨간 띠 (스펙 3.4 · 3.5)", () => {
  it("연결이 끊기면 띠가 뜨고 닫을 수 없으며, 다시 연결되면 사라진다", async () => {
    const { backend } = renderApp();
    await flush();
    expect(screen.queryByRole("alert")).toBeNull();

    act(() => backend.dev.setConnected(false));
    await flush();
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(CONNECTION_LOST_BANNER);
    expect(within(banner).queryByRole("button")).toBeNull();

    act(() => backend.dev.setConnected(true));
    await advance(1000);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("서버가 자동으로 끄면 띠가 뜨고 주문받기를 켤 때까지 남는다 (Q54)", async () => {
    const { backend } = renderApp();
    await flush();
    fireEvent.click(screen.getByRole("switch", { name: "주문 받기" }));
    await flush();

    act(() => backend.dev.triggerAutoOff());
    await flush();

    expect(screen.getByRole("alert")).toHaveTextContent(AUTO_OFF_BANNER);
    expect(screen.getByRole("switch", { name: "주문 받기" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await advance(60_000); // 시간이 지나도 남는다
    expect(screen.getByRole("alert")).toHaveTextContent(AUTO_OFF_BANNER);

    fireEvent.click(screen.getByRole("switch", { name: "주문 받기" }));
    await flush();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("자동 OFF 뒤 서버가 보낸 다른 OFF · 재연결 동기화로는 띠가 사라지지 않는다 (켤 때까지 남는다)", async () => {
    const { backend } = renderApp();
    await flush();
    act(() => backend.dev.triggerAutoOff());
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(AUTO_OFF_BANNER);

    // 인터넷이 잠깐 끊겼다 이어져 서버 상태(OFF)를 다시 맞춘다.
    act(() => backend.dev.setConnected(false));
    await flush();
    act(() => backend.dev.setConnected(true));
    await advance(1000);

    expect(screen.queryByText(CONNECTION_LOST_BANNER)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(AUTO_OFF_BANNER);
  });

  it("두 띠가 같이 뜨면 인터넷 끊김이 위, 자동 OFF가 아래다", async () => {
    const { backend } = renderApp();
    await flush();
    act(() => backend.dev.triggerAutoOff());
    act(() => backend.dev.setConnected(false));
    await flush();

    expect(screen.getAllByRole("alert").map((e) => e.textContent)).toEqual([
      CONNECTION_LOST_BANNER,
      AUTO_OFF_BANNER,
    ]);
  });
});

describe("더보기 [새로고침] (Q05)", () => {
  it("메뉴 맨 앞에 있고, 누르면 전체를 다시 받으며 주문받기 · 로그인은 그대로다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const { fakeWindow } = renderApp(backend);
    await flush();
    fireEvent.click(screen.getByRole("switch", { name: "주문 받기" }));
    await flush();
    const fetch = vi.spyOn(backend.api, "fetchOrders");

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("새로고침");
    fireEvent.click(items[0]);
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("switch", { name: "주문 받기" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("tab", { name: "주문접수" })).toBeInTheDocument();
    expect(fakeWindow.win.minimize).not.toHaveBeenCalled();
  });
});

describe("[새로고침] 실패 문구 (결정 C-1)", () => {
  async function clickRefresh() {
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "새로고침",
      }),
    );
    await flush();
  }

  it("조회에 실패하면 공용 Toast로 실패 문구를 2초 보인다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    renderApp(backend);
    await flush();
    vi.spyOn(backend.api, "fetchOrders").mockRejectedValue(new Error("500"));

    await clickRefresh();

    expect(screen.getByRole("status")).toHaveTextContent(
      "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
    await advance(2_000);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("성공하면 문구가 없다", async () => {
    renderApp();
    await flush();

    await clickRefresh();

    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("확인창의 처리할 주문 건수 (Q04, 완료 기준 7)", () => {
  it("받은 주문 중 처리할 주문 건수가 경고 줄에 나온다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(3);
    renderApp(backend);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "프로그램 종료",
      }),
    );

    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByText(/^처리할 주문이 3건 있습니다\./),
    ).toBeInTheDocument();
  });

  it("고객이 취소해 0건이 되면 경고 줄이 없다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(1);
    renderApp(backend);
    await flush();
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "프로그램 종료",
      }),
    );

    // 주문접수 화면의 빈 문구(「처리할 주문이 없습니다.」)와 겹치지 않게 확인창 안에서만 찾는다.
    expect(
      within(screen.getByRole("alertdialog")).queryByText(/처리할 주문이/),
    ).toBeNull();
  });
});

describe("서버 요청 10초 제한 (스펙 3.6, 완료 기준 6)", () => {
  it("로그아웃 전 '주문 중단' 요청이 10초 동안 응답이 없으면 그대로 로그아웃한다", async () => {
    const hanging: StoreStatusApi = {
      setAcceptingOrders: () => new Promise(() => {}),
    };
    renderApp(createMockOrderBackend({ delayMs: 0 }), hanging);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "로그아웃",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
    await advance(9_999);
    expect(screen.queryByRole("tab", { name: "주문접수" })).not.toBeNull();
    await advance(1);

    expect(screen.queryByRole("tab", { name: "주문접수" })).toBeNull();
  });

  it("주문받기 켜기 요청이 10초 동안 응답이 없으면 실패 토스트를 보이고 상태는 그대로다", async () => {
    const hanging: StoreStatusApi = {
      setAcceptingOrders: () => new Promise(() => {}),
    };
    renderApp(createMockOrderBackend({ delayMs: 0 }), hanging);
    await flush();

    fireEvent.click(screen.getByRole("switch", { name: "주문 받기" }));
    await advance(10_000);

    expect(screen.getByRole("status")).toHaveTextContent(
      "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
    expect(screen.getByRole("switch", { name: "주문 받기" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
