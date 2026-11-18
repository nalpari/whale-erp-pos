// 주문접수 화면 (SPEC-order-board 5장). 진짜 OrdersProvider + 모의 서버로 버튼 흐름을 끝까지 돌린다.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockOrderFeed } from "../../shared/api/order-feed";
import {
  createMockOrderBackend,
  type MockOrderBackend,
  type OrderApi,
} from "../../shared/api/orders";
import { createFakeLogApi } from "../../shared/log/log-api";
import { ORDER_MESSAGES } from "../../shared/orders/order-texts";
import { OrdersProvider } from "../../shared/orders/OrdersProvider";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../../shared/printer/printer-api";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import { createFakeWindow } from "../../test/fakes";
import { AppShell } from "../app-shell/AppShell";
import { AppShellProvider } from "../app-shell/AppShellContext";
import { BOARD_TEXTS } from "./board-texts";

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

function renderBoard(
  options: {
    delayMs?: number;
    api?: Partial<OrderApi>;
    backend?: MockOrderBackend;
  } = {},
) {
  const backend =
    options.backend ??
    createMockOrderBackend({ delayMs: options.delayMs ?? 0 });
  const sound = { playNewOrder: vi.fn(), playWarning: vi.fn() };
  const api: OrderApi = { ...backend.api, ...options.api };
  const ui = () => (
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
        orderApi={api}
        orderFeed={createMockOrderFeed(backend)}
        storeStatusApi={backend.storeStatusApi}
        sound={sound}
      >
        <AppShell />
      </OrdersProvider>
    </AppShellProvider>
  );
  return { backend, sound, api, ...render(ui()) };
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const card = (n: number) =>
  screen.getByRole("article", { name: `픽업번호 ${n}` });
const press = async (el: HTMLElement) => {
  fireEvent.click(el);
  await flush();
};
const tab = (name: string) => screen.getByRole("tab", { name });
const BOARD_TAB = "접수대기 · 제조중 · 제조완료";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("탭 · 빈 화면 (2.1 · 2.8)", () => {
  it("첫 탭이 기본이고 주문이 없으면 빈 문구가 보인다", async () => {
    renderBoard();
    await flush();
    expect(tab(BOARD_TAB)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(BOARD_TEXTS.emptyBoard)).toBeInTheDocument();

    await press(tab("픽업완료"));
    expect(screen.getByText(BOARD_TEXTS.emptyPickedUp)).toBeInTheDocument();
  });

  it("주문받기가 OFF여도 들어온 주문은 보이고 처리할 수 있다 (Q04)", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    expect(card(1)).toBeInTheDocument();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    expect(within(card(1)).getByText("제조중")).toBeInTheDocument();
  });
});

describe("카드 (2.3 · 2.4)", () => {
  it("긴 주문: 메뉴 3줄 + 외 N개, 옵션 한 줄, 요청사항 칸", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(3)); // 3번째 모의 주문이 긴 주문이다
    await flush();
    const c = card(3);
    expect(within(c).getByText("#3")).toBeInTheDocument();
    expect(within(c).getAllByText(/\(시험\)/)).toHaveLength(3);
    expect(within(c).getByText("+ 외 2개")).toBeInTheDocument();
    expect(
      within(c).getByText(
        "샷 추가, 시럽 빼기, 얼음 적게, 컵 두 개로 나눠 담기",
      ),
    ).toHaveClass("truncate");
    expect(within(c).getByText(/^얼음 조금만/)).toHaveClass("line-clamp-2");
    // 요청사항이 없는 카드에는 노란 칸이 없다
    expect(card(1).querySelector(".bg-yellow-200")).toBeNull();
    expect(within(card(1)).queryByText(/외 \d+개/)).toBeNull();
  });

  it("픽업번호는 0 없이, 버튼은 44px 이상(min-h-14)이다", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    expect(within(card(1)).getByText("#1")).toBeInTheDocument();
    expect(
      within(card(1)).getByRole("button", { name: "주문접수" }),
    ).toHaveClass("min-h-14");
  });

  it("1분마다 시간 글자만 바뀐다: 지금 픽업 → 3분 지남, 12분에 자동 취소 경고", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1)); // 첫 모의 주문은 「지금」
    await flush();
    expect(within(card(1)).getByText(/지금 픽업/)).toBeInTheDocument();
    expect(within(card(1)).queryByText(/지남/)).toBeNull();
    expect(within(card(1)).queryByText("3분 뒤 자동 취소")).toBeNull();

    await advance(3 * 60_000);
    expect(within(card(1)).getByText("3분 지남")).toHaveClass("text-red-600");

    await advance(9 * 60_000);
    expect(within(card(1)).getByText("3분 뒤 자동 취소")).toBeInTheDocument();
  });

  it("접수한 카드에는 자동 취소 경고가 없다", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    await advance(13 * 60_000);
    expect(within(card(1)).queryByText("3분 뒤 자동 취소")).toBeNull();
  });
});

describe("버튼 흐름 (2.6 · 2.7)", () => {
  it("접수 → 제조중 → 제조완료 → 픽업완료(배너 5초) → 5초 뒤 픽업완료 탭", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();

    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    expect(within(card(1)).getByText("제조중")).toBeInTheDocument();
    await press(within(card(1)).getByRole("button", { name: "제조완료" }));
    expect(within(card(1)).getByText("제조완료")).toBeInTheDocument();
    await press(within(card(1)).getByRole("button", { name: "픽업완료" }));

    expect(screen.getByText(BOARD_TEXTS.pickupBanner(1))).toBeInTheDocument();
    // 5초 전까지 카드는 첫 탭에 남는다. 픽업완료에는 버튼이 없다.
    expect(within(card(1)).getByText("픽업완료")).toBeInTheDocument();
    expect(within(card(1)).queryByRole("button")).toBeNull();

    await advance(5100);
    expect(screen.queryByText(BOARD_TEXTS.pickupBanner(1))).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    await press(tab("픽업완료"));
    expect(card(1)).toBeInTheDocument();
  });

  it("배너의 카운트다운이 줄고, 5초 안 [완료 취소]면 제조완료로 돌아온다", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    await press(within(card(1)).getByRole("button", { name: "제조완료" }));
    await press(within(card(1)).getByRole("button", { name: "픽업완료" }));
    expect(
      screen.getByRole("button", { name: "완료 취소(05)" }),
    ).toBeInTheDocument();

    await advance(2000);
    await press(screen.getByRole("button", { name: "완료 취소(03)" }));

    expect(screen.queryByText(BOARD_TEXTS.pickupBanner(1))).toBeNull();
    expect(within(card(1)).getByText("제조완료")).toBeInTheDocument();
    expect(
      within(card(1)).getByRole("button", { name: "픽업완료" }),
    ).toBeInTheDocument();
  });

  it("요청 중에는 버튼이 막히고 「처리 중…」이 보이며 요청은 한 번만 간다", async () => {
    const { backend, api } = renderBoard({ delayMs: 300 });
    await advance(400);
    act(() => backend.dev.addOrders(1));
    await advance(0);
    const spy = vi.spyOn(api, "changeStatus");

    fireEvent.click(within(card(1)).getByRole("button", { name: "주문접수" }));
    await flush();
    const busy = within(card(1)).getByRole("button", { name: "처리 중…" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    await advance(400);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(within(card(1)).getByText("제조중")).toBeInTheDocument();
  });
});

describe("실패 토스트 (2.6, 완료 기준 4)", () => {
  async function setupFailing(
    makeResult: (
      order: Awaited<ReturnType<OrderApi["fetchOrders"]>>[number],
    ) => unknown,
  ) {
    let latest: Awaited<ReturnType<OrderApi["fetchOrders"]>>[number] | null =
      null;
    const ctx = renderBoard({
      api: {
        changeStatus: async () => {
          if (!latest) throw new Error("없음");
          const result = makeResult(latest);
          if (result instanceof Error) throw result;
          return result as never;
        },
      },
    });
    await flush();
    act(() => ctx.backend.dev.addOrders(1));
    await flush();
    [latest] = await ctx.backend.api.fetchOrders();
    return ctx;
  }

  // 실제 서버처럼 응답 주문은 updatedAt이 더 크다. 같으면 T03이 오래된 변경으로 보고 버린다.
  const newer = (o: { updatedAt: number }) => ({
    updatedAt: o.updatedAt + 1000,
  });

  it("이미 다른 PC가 처리: 카드는 서버가 준 최신 상태(제조중)가 되고 토스트가 뜬다", async () => {
    await setupFailing((o) => ({
      kind: "already-handled",
      order: { ...o, status: "preparing", ...newer(o) },
    }));
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      `#1 ${ORDER_MESSAGES.alreadyHandled}`,
    );
    expect(within(card(1)).getByText("제조중")).toBeInTheDocument();
  });

  it("고객이 먼저 취소: 카드가 사라지고 토스트와 고객 취소 배너가 함께 뜬다", async () => {
    const { sound } = await setupFailing((o) => ({
      kind: "customer-cancelled",
      order: { ...o, status: "customer-cancelled", ...newer(o) },
    }));
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    expect(screen.queryByRole("article")).toBeNull();
    const texts = screen.getAllByRole("status").map((e) => e.textContent);
    expect(texts).toContain(`#1 ${ORDER_MESSAGES.customerCancelled}`);
    expect(texts).toContain(BOARD_TEXTS.customerCancelBanner(1));
    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);
  });

  it("서버 오류: 토스트가 뜨고 카드는 그대로다", async () => {
    await setupFailing(() => new Error("서버 오류"));
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      `#1 ${ORDER_MESSAGES.failed}`,
    );
    expect(within(card(1)).getByText("접수대기")).toBeInTheDocument();
    expect(screen.queryByText(/픽업완료 되었습니다/)).toBeNull();
  });
});

describe("[픽업완료] · [완료 취소] 실패 (2.6 · 2.7)", () => {
  // 지정한 동작만 던지고 나머지는 모의 서버에 맡긴다.
  function renderFailingOn(action: "pickup" | "undo-pickup") {
    const backend = createMockOrderBackend({ delayMs: 0 });
    return renderBoard({
      backend,
      api: {
        changeStatus: async (request) => {
          if (request.action === action) throw new Error("서버 오류");
          return backend.api.changeStatus(request);
        },
      },
    });
  }
  async function toReady(backend: MockOrderBackend) {
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    await press(within(card(1)).getByRole("button", { name: "제조완료" }));
  }

  it("[픽업완료]가 실패하면 토스트만 뜨고 배너도 없고 카드는 제조완료로 남는다", async () => {
    const { backend } = renderFailingOn("pickup");
    await toReady(backend);
    await press(within(card(1)).getByRole("button", { name: "픽업완료" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      `#1 ${ORDER_MESSAGES.failed}`,
    );
    expect(screen.queryByText(BOARD_TEXTS.pickupBanner(1))).toBeNull();
    expect(within(card(1)).getByText("제조완료")).toBeInTheDocument();
  });

  it("[완료 취소]가 실패하면 토스트가 뜨고 배너와 픽업완료 카드는 그대로다", async () => {
    const { backend } = renderFailingOn("undo-pickup");
    await toReady(backend);
    await press(within(card(1)).getByRole("button", { name: "픽업완료" }));
    await press(screen.getByRole("button", { name: /^완료 취소/ }));

    expect(screen.getAllByRole("status").map((e) => e.textContent)).toContain(
      `#1 ${ORDER_MESSAGES.failed}`,
    );
    expect(screen.getByText(BOARD_TEXTS.pickupBanner(1))).toBeInTheDocument();
    expect(within(card(1)).getByText("픽업완료")).toBeInTheDocument();
  });
});

describe("0시 (2.1)", () => {
  it("0시가 지나면 [픽업완료] 탭이 비워진다", async () => {
    vi.setSystemTime(new Date(2026, 10, 18, 23, 59, 0));
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    await press(within(card(1)).getByRole("button", { name: "제조완료" }));
    await press(within(card(1)).getByRole("button", { name: "픽업완료" }));
    await advance(5100);
    await press(tab("픽업완료"));
    expect(card(1)).toBeInTheDocument();

    await advance(2 * 60_000);
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByText(BOARD_TEXTS.emptyPickedUp)).toBeInTheDocument();
  });
});

describe("고객 취소 (2.7, 완료 기준 5)", () => {
  it("카드가 사라지고 배너 5초 + 알림음 한 번", async () => {
    const { backend, sound } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(2));
    await flush();

    act(() => backend.dev.customerCancelsOldestPending());
    await flush();

    expect(screen.queryByRole("article", { name: "픽업번호 1" })).toBeNull();
    expect(card(2)).toBeInTheDocument();
    expect(
      screen.getByText(BOARD_TEXTS.customerCancelBanner(1)),
    ).toBeInTheDocument();
    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);

    await advance(5100);
    expect(screen.queryByText(BOARD_TEXTS.customerCancelBanner(1))).toBeNull();
    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);
  });

  it("접수대기였던 주문만 알린다: 제조중 주문을 고객이 취소해도 배너 · 알림음이 없다", async () => {
    const { backend, sound } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));

    act(() => backend.dev.customerCancels("mock-order-1"));
    await flush();

    expect(screen.queryByRole("article")).toBeNull(); // 실제로 취소가 반영됐다
    expect(sound.playNewOrder).not.toHaveBeenCalled();
    expect(screen.queryByText(/고객이 주문을 취소/)).toBeNull();
  });

  it("화면을 열 때 이미 고객취소인 주문에는 배너 · 알림음이 없다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(1);
    backend.dev.customerCancels("mock-order-1");
    const { sound } = renderBoard({ backend });
    await flush();
    expect(screen.queryByText(/고객이 주문을 취소/)).toBeNull();
    expect(sound.playNewOrder).not.toHaveBeenCalled();
  });

  it("다른 탭에 있을 때 생긴 고객 취소는 배너는 없지만 알림음은 한 번 울린다 (11장 E, 사용자 결정)", async () => {
    const { backend, sound } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();

    await press(tab("주문내역"));
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();
    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);
    await press(tab("주문접수"));

    expect(screen.queryByText(/고객이 주문을 취소/)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull(); // 취소가 반영됐다
    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);
  });

  it("배너가 여럿이면 쌓이고 각각 따로 사라진다", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(2));
    await flush();
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();
    await advance(2000);
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();
    expect(screen.getAllByText(/고객이 주문을 취소했습니다/)).toHaveLength(2);

    await advance(3100);
    const left = screen.getAllByText(/고객이 주문을 취소했습니다/);
    expect(left).toHaveLength(1);
    expect(left[0]).toHaveTextContent("#2");
  });
});

describe("정렬 · 필터 (2.1 · 2.2, 완료 기준 1)", () => {
  const order = () =>
    screen.getAllByRole("article").map((a) => a.getAttribute("aria-label"));

  it("최신순이 기본이고, 오래된순을 고르면 PC에 저장돼 다시 켜도 유지된다", async () => {
    const { backend, unmount } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(2));
    await flush();
    expect(order()).toEqual(["픽업번호 2", "픽업번호 1"]);

    fireEvent.change(screen.getByRole("combobox", { name: "정렬" }), {
      target: { value: "oldest" },
    });
    expect(order()).toEqual(["픽업번호 1", "픽업번호 2"]);
    expect(localStorage.getItem("orderBoardSort")).toBe("oldest");

    unmount();
    renderBoard();
    await flush();
    expect(screen.getByRole("combobox", { name: "정렬" })).toHaveValue(
      "oldest",
    );
  });

  it("저장소가 막혀도 정렬은 바뀐다", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("막힘");
    });
    fireEvent.change(screen.getByRole("combobox", { name: "정렬" }), {
      target: { value: "oldest" },
    });
    expect(screen.getByRole("combobox", { name: "정렬" })).toHaveValue(
      "oldest",
    );
  });

  it("체크를 풀면 그 상태 카드가 숨고 건수는 그대로 보인다. 필터는 저장하지 않는다", async () => {
    const { backend, unmount } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(2));
    await flush();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));

    const pending = screen.getByRole("checkbox", { name: "접수대기 1" });
    expect(screen.getByRole("checkbox", { name: "제조중 1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "제조완료 0" })).toBeChecked();

    fireEvent.click(pending);
    expect(order()).toEqual(["픽업번호 1"]);
    expect(
      screen.getByRole("checkbox", { name: "접수대기 1" }),
    ).not.toBeChecked();

    unmount();
    renderBoard();
    await flush();
    expect(screen.getByRole("checkbox", { name: /^접수대기/ })).toBeChecked();
  });

  it("픽업완료 탭에는 필터 · 정렬 칸이 없다", async () => {
    renderBoard();
    await flush();
    await press(tab("픽업완료"));
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("이전 / 다음 (2.5, 완료 기준 6)", () => {
  function stubLayout(scrollHeight: number, clientHeight: number) {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
      scrollHeight,
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(
      clientHeight,
    );
  }

  it("카드가 한 화면 안이면 버튼이 없다", async () => {
    stubLayout(400, 500);
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
    expect(screen.queryByRole("button", { name: "이전" })).toBeNull();
  });

  it("넘치면 버튼이 보이고 한 번에 한 화면 분량씩 넘긴다", async () => {
    stubLayout(1500, 500);
    const scrollBy = vi.fn();
    // jsdom에는 scrollBy가 없다. restoreAllMocks로는 되돌려지지 않아 끝에서 지운다.
    Element.prototype.scrollBy = scrollBy;
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, "scrollBy");
    });
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();

    await press(screen.getByRole("button", { name: "다음" }));
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 500, behavior: "smooth" });
    await press(screen.getByRole("button", { name: "이전" }));
    expect(scrollBy).toHaveBeenLastCalledWith({
      top: -500,
      behavior: "smooth",
    });
  });
});

describe("주문 50건 (완료 기준 7)", () => {
  it("한꺼번에 들어와도 1초 안에 그려진다 (테스트 환경 기준 참고 값)", async () => {
    vi.useRealTimers();
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(50);
    const t0 = performance.now();
    renderBoard({ backend });
    expect(await screen.findAllByRole("article")).toHaveLength(50);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
