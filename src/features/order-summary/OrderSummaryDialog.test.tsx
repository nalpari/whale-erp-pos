// 요약 팝업 · 취소 사유 팝업 (SPEC-order-summary 6장). 진짜 OrdersProvider + 모의 서버로 주문접수 화면 안에서 끝까지 돌린다.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { BOARD_TEXTS } from "../order-board/board-texts";
import {
  OrdersContext,
  type OrdersContextValue,
} from "../../shared/orders/orders-context";
import { RemakeDialog } from "./RemakeDialog";
import { CANCEL_TEXTS, REMAKE_TEXTS } from "./summary-texts";

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

function renderBoard(
  options: {
    api?: Partial<OrderApi> | ((b: MockOrderBackend) => Partial<OrderApi>);
  } = {},
) {
  const backend = createMockOrderBackend({ delayMs: 0 });
  const sound = { playNewOrder: vi.fn(), playWarning: vi.fn() };
  const over =
    typeof options.api === "function" ? options.api(backend) : options.api;
  const api: OrderApi = { ...backend.api, ...over };
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
        orderApi={api}
        orderFeed={createMockOrderFeed(backend)}
        storeStatusApi={backend.storeStatusApi}
        sound={sound}
      >
        <AppShell />
      </OrdersProvider>
    </AppShellProvider>,
  );
  return { backend };
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const press = async (el: HTMLElement) => {
  fireEvent.click(el);
  await flush();
};
const card = (n: number) =>
  screen.getByRole("article", { name: `픽업번호 ${n}` });
const summary = () => screen.queryByRole("dialog", { name: /^#\d+/ });
const cancelDialog = () =>
  screen.queryByRole("dialog", { name: CANCEL_TEXTS.title });
const inSummary = () => within(summary()!);
const inCancel = () => within(cancelDialog()!);

// 실제 터치 · 클릭은 카드에 초점을 주므로 같게 흉내 낸다 (닫을 때 초점이 돌아오는지 보려고).
const openCard = async (n: number) => {
  card(n).focus();
  await press(card(n));
};

async function openWith(count = 1) {
  const { backend } = renderBoard();
  await flush();
  act(() => backend.dev.addOrders(count));
  await flush();
  await openCard(1);
  return backend;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("여닫기 (2.1)", () => {
  it("카드를 누르면 열리고 ×, 바깥, Esc로 닫힌다. 팝업 안을 눌러도 닫히지 않는다", async () => {
    await openWith();
    expect(summary()).toBeInTheDocument();
    await press(inSummary().getByText("주문일시"));
    expect(summary()).toBeInTheDocument();

    await press(inSummary().getByRole("button", { name: "닫기" }));
    expect(summary()).toBeNull();

    await openCard(1);
    fireEvent.click(summary()!.parentElement!); // 어두운 바깥 영역
    expect(summary()).toBeNull();

    await openCard(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(summary()).toBeNull();
    expect(screen.queryByText(/다른 PC에서 이미 처리/)).toBeNull();
    expect(card(1)).toHaveFocus(); // 초점이 카드로 돌아온다
  });

  it("카드 안 버튼을 눌러도 팝업은 열리지 않는다", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(within(card(1)).getByRole("button", { name: "주문접수" }));
    expect(summary()).toBeNull();
  });
});

describe("내용 (2.2)", () => {
  it("단계 · 기본 정보 · 요청사항 · 메뉴 전체가 보인다", async () => {
    const { backend } = renderBoard();
    await flush();
    act(() => backend.dev.addOrders(3)); // 3번째가 긴 주문
    await flush();
    await press(card(3));
    const d = inSummary();
    expect(d.getByText("#3")).toBeInTheDocument();
    expect(d.getAllByRole("listitem")).toHaveLength(4 + 5); // 단계 4 + 메뉴 5
    expect(
      within(d.getByRole("list", { name: "처리 단계" })).getByText("접수대기"),
    ).toBeInTheDocument();
    expect(d.getByText("261118000001" + "0003")).toBeInTheDocument();
    expect(d.getByText("홍*동")).toBeInTheDocument();
    expect(d.getByText("***-****-0000")).toBeInTheDocument();
    expect(d.getByText(/^얼음 조금만.*포장해 주세요\.$/)).toBeInTheDocument();
    expect(
      d.getByText("샷 추가, 시럽 빼기, 얼음 적게, 컵 두 개로 나눠 담기"),
    ).toBeInTheDocument();
    expect(d.getByText(/초코 쿠키\(시험\) × 3/)).toBeInTheDocument();
  });

  it("요청사항이 없으면 칸이 없다", async () => {
    await openWith();
    expect(inSummary().queryByText("요청사항")).toBeNull();
  });
});

describe("상태별 버튼 (2.3)", () => {
  const btn = (name: string) => inSummary().getByRole("button", { name });

  it("접수대기 → 제조중 → 제조완료: 표대로 버튼이 바뀌고 팝업은 열려 있다", async () => {
    await openWith();
    expect(btn("주문취소")).toBeEnabled();
    expect(btn("영수증 인쇄")).toBeDisabled();
    expect(btn("주문서 인쇄")).toBeDisabled();
    expect(btn("주문접수")).toHaveClass("bg-blue-600");
    expect(btn("주문취소")).not.toHaveClass("bg-blue-600");
    expect(btn("주문접수")).toHaveClass("min-h-14");

    await press(btn("주문접수"));
    expect(summary()).toBeInTheDocument();
    expect(inSummary().getByText("제조중", { selector: "span" })).toBeVisible();
    expect(btn("주문취소")).toBeEnabled();
    expect(btn("제조완료")).toBeInTheDocument();
    // 접수한 시각이 체크 옆에 시:분으로 보인다
    expect(
      inSummary().getByText(/^\d\d:\d\d$/, { selector: "p" }),
    ).toBeVisible();

    await press(btn("제조완료"));
    expect(btn("주문취소")).toBeEnabled(); // 제조완료도 취소할 수 있다 (T18)
    expect(btn("픽업완료")).toBeEnabled();
  });

  it("[픽업완료]가 성공하면 팝업이 닫히고 T04 배너가 뜬다", async () => {
    await openWith();
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    await press(btn("픽업완료"));
    expect(summary()).toBeNull();
    expect(screen.getByText(BOARD_TEXTS.pickupBanner(1))).toBeInTheDocument();
    expect(screen.queryByText(/다른 PC에서 이미 처리/)).toBeNull();
  });

  it("오늘 결제한 픽업완료 카드는 [주문취소]만 있고 인쇄는 막혀 있다 (T18)", async () => {
    const backend = await openWith();
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    await press(btn("픽업완료"));
    act(() => backend.dev.setConnected(true));
    await press(card(1));
    expect(btn("영수증 인쇄")).toBeDisabled();
    expect(btn("주문취소")).toBeEnabled();
    expect(
      inSummary().queryByRole("button", {
        name: /주문접수|제조완료|픽업완료$/,
      }),
    ).toBeNull();
  });

  it("픽업완료 주문을 취소하면 [픽업완료] 탭에서 빠진다 (T18)", async () => {
    const backend = await openWith();
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    await press(btn("픽업완료"));
    act(() => backend.dev.setConnected(true));
    await press(card(1));
    await press(btn("주문취소"));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    await press(inCancel().getByRole("button", { name: "주문취소" }));
    expect(summary()).toBeNull();
    expect(screen.queryByRole("article", { name: "픽업번호 1" })).toBeNull();
    expect((await backend.api.fetchOrders()).length).toBe(0);
    expect(screen.queryByText(/완료 취소/)).toBeNull(); // 5초 배너도 같이 빠진다
  });

  it("서버가 too-late로 거절하면 「#1 취소할 수 있는 시간이 지났습니다.」 토스트, 상태는 그대로 (T18)", async () => {
    const { backend } = renderBoard({
      api: (b) => ({
        changeStatus: async (request) =>
          request.action === "cancel"
            ? {
                kind: "too-late",
                order: (await b.api.fetchOrders())[0],
              }
            : b.api.changeStatus(request),
      }),
    });
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await openCard(1);
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    await press(btn("주문취소"));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    await press(inCancel().getByRole("button", { name: "주문취소" }));
    expect(
      screen.getByText("#1 취소할 수 있는 시간이 지났습니다."),
    ).toBeInTheDocument();
    expect(cancelDialog()).toBeNull(); // too-late는 사유 팝업을 닫는다 (사용자 결정 A-1)
    // 화면 상태도 그대로: 팝업이 열려 있고 제조완료의 다음 단계 버튼이 남아 있다.
    expect(btn("픽업완료")).toBeEnabled();
    expect(card(1)).toBeInTheDocument();
    expect((await backend.api.fetchOrders())[0].status).toBe("ready");
  });

  it("0시가 지나 too-late를 받으면 사유 팝업만 닫히고, 요약 팝업은 열린 채 [주문취소]가 사라진다 (T18, 사용자 결정 A-1)", async () => {
    const backend = await openWith();
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    await press(btn("픽업완료"));
    act(() => backend.dev.setConnected(true));
    await press(card(1));
    await press(btn("주문취소"));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    // 사유를 고르는 사이 0시가 지났다: 모의 서버가 too-late로 거절한다.
    vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await press(inCancel().getByRole("button", { name: "주문취소" }));
    expect(
      screen.getByText("#1 취소할 수 있는 시간이 지났습니다."),
    ).toBeInTheDocument();
    expect(cancelDialog()).toBeNull();
    expect(summary()).toBeInTheDocument();
    expect(inSummary().queryByRole("button", { name: "주문취소" })).toBeNull();
    expect((await backend.api.fetchOrders())[0].status).toBe("picked-up");
  });

  it("다른 실패(서버 오류)는 사유 팝업을 닫지 않는다", async () => {
    const { backend } = renderBoard({
      api: (b) => ({
        changeStatus: (request) =>
          request.action === "cancel"
            ? Promise.reject(new Error("서버 오류"))
            : b.api.changeStatus(request),
      }),
    });
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await openCard(1);
    await press(btn("주문취소"));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    await press(inCancel().getByRole("button", { name: "주문취소" }));
    expect(screen.getByText(/처리하지 못했습니다/)).toBeInTheDocument();
    expect(cancelDialog()).toBeInTheDocument();
    expect(inCancel().getByLabelText("영업이 종료되었습니다")).toBeChecked(); // 사유도 남는다
  });

  it("다음 단계가 실패하면 「#번호 …」 토스트, 팝업과 상태는 그대로", async () => {
    const { backend } = renderBoard({
      api: { changeStatus: () => Promise.reject(new Error("서버 오류")) },
    });
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(card(1));
    await press(inSummary().getByRole("button", { name: "주문접수" }));
    expect(screen.getByText(`#1 ${ORDER_MESSAGES.failed}`)).toBeInTheDocument();
    expect(summary()).toBeInTheDocument();
    expect(inSummary().getByRole("button", { name: "주문접수" })).toBeEnabled();
  });
});

describe("취소 사유 팝업 (3장)", () => {
  async function openCancel() {
    const backend = await openWith();
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    return backend;
  }
  const confirm = () => inCancel().getByRole("button", { name: "주문취소" });

  it("처음엔 선택이 없고 초점은 [닫기], 사유를 골라야 [주문취소]가 눌린다", async () => {
    await openCancel();
    expect(inCancel().getAllByRole("radio")).toHaveLength(5);
    expect(
      inCancel()
        .getAllByRole("radio")
        .every((r) => !(r as HTMLInputElement).checked),
    ).toBe(true);
    expect(inCancel().getByRole("button", { name: "닫기" })).toHaveFocus();
    expect(confirm()).toBeDisabled();
    expect(
      inCancel().getByRole("textbox", { name: CANCEL_TEXTS.customLabel }),
    ).toBeDisabled();

    await press(inCancel().getByLabelText("재료가 소진되었습니다"));
    expect(confirm()).toBeEnabled();
  });

  it("직접 입력: 공백뿐이면 막히고, 50자 넘게 붙여넣으면 50자만 남기고 안내한다", async () => {
    await openCancel();
    await press(inCancel().getByLabelText("직접 입력"));
    const input = inCancel().getByRole("textbox", {
      name: CANCEL_TEXTS.customLabel,
    }) as HTMLInputElement;
    expect(input).toBeEnabled();
    expect(
      inCancel().getByText(CANCEL_TEXTS.customNotice, { exact: false }),
    ).toBeVisible();

    fireEvent.change(input, { target: { value: "   " } });
    expect(confirm()).toBeDisabled();

    fireEvent.change(input, { target: { value: "가".repeat(49) + "🙂🙂" } });
    expect(Array.from(input.value)).toHaveLength(50);
    expect(inCancel().getByText(CANCEL_TEXTS.tooLong)).toBeInTheDocument();
    expect(confirm()).toBeEnabled();
  });

  it("바깥을 눌러도 닫히지 않고, Esc · [닫기]는 요약 팝업으로 돌아간다", async () => {
    await openCancel();
    fireEvent.click(cancelDialog()!.parentElement!);
    expect(cancelDialog()).toBeInTheDocument();
    expect(summary()).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(cancelDialog()).toBeNull();
    expect(summary()).toBeInTheDocument(); // Esc는 맨 위 팝업만

    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await press(inCancel().getByRole("button", { name: "닫기" }));
    expect(cancelDialog()).toBeNull();
    expect(summary()).toBeInTheDocument();
  });

  it("성공하면 서버에 고른 문구가 가고 두 팝업이 닫히며 카드가 사라진다", async () => {
    const changeStatus = vi.fn();
    const { backend: b } = renderBoard({
      api: (backend) => ({
        changeStatus: changeStatus.mockImplementation(backend.api.changeStatus),
      }),
    });
    await flush();
    act(() => b.dev.addOrders(1));
    await flush();
    await press(card(1));
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await press(inCancel().getByLabelText("직접 입력"));
    fireEvent.change(
      inCancel().getByRole("textbox", { name: CANCEL_TEXTS.customLabel }),
      { target: { value: "  사정이 생겼습니다  " } },
    );
    await press(confirm());
    expect(cancelDialog()).toBeNull();
    expect(summary()).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(changeStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "cancel",
        reason: "사정이 생겼습니다",
      }),
    );
  });

  it("실패하면 취소 사유 팝업을 닫지 않고 고른 사유를 유지한 채 토스트를 보인다", async () => {
    const { backend } = renderBoard({
      api: { changeStatus: () => Promise.reject(new Error("서버 오류")) },
    });
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await press(card(1));
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    await press(confirm());
    expect(cancelDialog()).toBeInTheDocument();
    expect(inCancel().getByLabelText("영업이 종료되었습니다")).toBeChecked();
    expect(confirm()).toBeEnabled();
    expect(screen.getByText(`#1 ${ORDER_MESSAGES.failed}`)).toBeInTheDocument();
  });
});

describe("열려 있는 동안 주문이 바뀌면 (2.5)", () => {
  it("다른 PC가 접수하면 팝업이 바로 제조중으로 바뀐다", async () => {
    const backend = await openWith();
    act(() => backend.dev.otherPcAcceptsOldestPending());
    await flush();
    expect(
      inSummary().getByRole("button", { name: "제조완료" }),
    ).toBeInTheDocument();
    expect(inSummary().queryByRole("button", { name: "주문접수" })).toBeNull();
  });

  it("고객이 취소하면 두 팝업이 닫히고 T04 고객 취소 배너가 뜬다", async () => {
    const backend = await openWith();
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    expect(cancelDialog()).toBeInTheDocument();
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();
    expect(cancelDialog()).toBeNull();
    expect(summary()).toBeNull();
    expect(
      screen.getByText(BOARD_TEXTS.customerCancelBanner(1)),
    ).toBeInTheDocument();
  });
});

describe("경합 (리뷰 ②)", () => {
  it("취소 사유 팝업이 떠 있는 동안 제조완료로 바뀌어도 사유 팝업은 그대로다 (T18: 제조완료도 취소할 수 있다)", async () => {
    const backend = await openWith();
    await press(inSummary().getByRole("button", { name: "주문접수" }));
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    expect(cancelDialog()).toBeInTheDocument();
    await act(async () => {
      await backend.api.changeStatus({
        orderId: "mock-order-1",
        action: "complete",
        idempotencyKey: "other-pc",
      });
    });
    await flush();
    expect(cancelDialog()).toBeInTheDocument();
    expect(inSummary().getByRole("button", { name: "주문취소" })).toBeEnabled();
  });

  it("[픽업완료] 응답을 기다리다 다른 카드를 열어도, 응답이 와서 그 팝업이 닫히지 않는다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { backend } = renderBoard({
      api: (b) => ({
        async changeStatus(request) {
          if (request.action === "pickup") await gate;
          return b.api.changeStatus(request);
        },
      }),
    });
    await flush();
    act(() => backend.dev.addOrders(2));
    await flush();
    for (const action of ["accept", "complete"] as const) {
      await act(async () => {
        await backend.api.changeStatus({
          orderId: "mock-order-1",
          action,
          idempotencyKey: `pre-${action}`,
        });
      });
    }
    await flush();
    await openCard(1);
    await press(inSummary().getByRole("button", { name: "픽업완료" }));
    await press(inSummary().getByRole("button", { name: "닫기" }));
    await openCard(2);
    expect(inSummary().getByText("#2")).toBeInTheDocument();

    release();
    await flush();
    expect(inSummary().getByText("#2")).toBeInTheDocument();
  });
});

describe("보강 (리뷰 ③)", () => {
  it("한글 조합 중에는 자르지 않고, 조합이 끝나면 50자로 자르고 안내한다", async () => {
    await openWith();
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await press(inCancel().getByLabelText("직접 입력"));
    const input = inCancel().getByRole("textbox", {
      name: CANCEL_TEXTS.customLabel,
    }) as HTMLInputElement;
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "가".repeat(51) } });
    expect(input.value).toHaveLength(51);
    expect(inCancel().queryByText(CANCEL_TEXTS.tooLong)).toBeNull();
    fireEvent.compositionEnd(input);
    expect(input.value).toHaveLength(50);
    expect(inCancel().getByText(CANCEL_TEXTS.tooLong)).toBeInTheDocument();
  });

  it("취소 요청 중에는 두 버튼과 사유 선택이 잠기고 Esc로도 닫히지 않는다", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { backend } = renderBoard({
      api: (b) => ({
        async changeStatus(request) {
          await gate;
          return b.api.changeStatus(request);
        },
      }),
    });
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await openCard(1);
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    await press(inCancel().getByRole("button", { name: "주문취소" }));

    expect(inCancel().getByRole("button", { name: "처리 중…" })).toBeDisabled();
    expect(inCancel().getByRole("button", { name: "닫기" })).toBeDisabled();
    expect(inCancel().getByLabelText("영업이 종료되었습니다")).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(cancelDialog()).toBeInTheDocument();

    release();
    await flush();
    expect(cancelDialog()).toBeNull();
    expect(summary()).toBeNull();
  });
});

describe("사라질 때 안내 (B-2)", () => {
  const handled = `#1 ${ORDER_MESSAGES.alreadyHandled}`;

  it("다른 PC가 취소해서 팝업이 닫히면 「다른 PC에서 이미 처리한 주문입니다.」 토스트", async () => {
    const backend = await openWith();
    await act(async () => {
      await backend.api.changeStatus({
        orderId: "mock-order-1",
        action: "cancel",
        reason: "다른 PC 취소",
        idempotencyKey: "other-pc-cancel",
      });
    });
    await flush();
    expect(summary()).toBeNull();
    expect(screen.getByText(handled)).toBeInTheDocument();
  });

  it("사유 팝업이 떠 있을 때도 같다 (두 팝업 닫힘 + 토스트)", async () => {
    const backend = await openWith();
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await act(async () => {
      await backend.api.changeStatus({
        orderId: "mock-order-1",
        action: "cancel",
        reason: "다른 PC 취소",
        idempotencyKey: "other-pc-cancel",
      });
    });
    await flush();
    expect(cancelDialog()).toBeNull();
    expect(summary()).toBeNull();
    expect(screen.getByText(handled)).toBeInTheDocument();
  });

  it("고객 취소면 토스트 없이 T04 배너만 뜬다", async () => {
    const backend = await openWith();
    act(() => backend.dev.customerCancelsOldestPending());
    await flush();
    expect(summary()).toBeNull();
    expect(screen.queryByText(handled)).toBeNull();
    expect(
      screen.getByText(BOARD_TEXTS.customerCancelBanner(1)),
    ).toBeInTheDocument();
  });

  it("내가 [주문취소]로 성공해서 닫힐 때는 토스트가 없다", async () => {
    await openWith();
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    await press(inCancel().getByRole("button", { name: "주문취소" }));
    expect(summary()).toBeNull();
    expect(screen.queryByText(handled)).toBeNull();
  });

  it("내 취소가 실패한 뒤 다른 PC가 취소하면 토스트가 뜬다", async () => {
    let fail = true;
    const { backend } = renderBoard({
      api: (b) => ({
        async changeStatus(request) {
          if (fail) throw new Error("서버 오류");
          return b.api.changeStatus(request);
        },
      }),
    });
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await openCard(1);
    await press(inSummary().getByRole("button", { name: "주문취소" }));
    await press(inCancel().getByLabelText("영업이 종료되었습니다"));
    await press(inCancel().getByRole("button", { name: "주문취소" }));
    expect(summary()).toBeInTheDocument(); // 실패: 팝업 유지
    fail = false;
    await act(async () => {
      await backend.api.changeStatus({
        orderId: "mock-order-1",
        action: "cancel",
        reason: "다른 PC 취소",
        idempotencyKey: "other-pc-cancel",
      });
    });
    await flush();
    expect(screen.getByText(handled)).toBeInTheDocument();
  });
});

describe("재제조 (T21, SPEC-remake)", () => {
  const btn = (name: string) => inSummary().getByRole("button", { name });
  const remakeDialog = () =>
    screen.queryByRole("dialog", { name: REMAKE_TEXTS.title });
  const inRemake = () => within(remakeDialog()!);
  const pickFirstMenu = () => press(inRemake().getAllByRole("checkbox")[0]);

  async function openReady(api?: (b: MockOrderBackend) => Partial<OrderApi>) {
    const { backend } = renderBoard({ api });
    await flush();
    act(() => backend.dev.addOrders(1));
    await flush();
    await openCard(1);
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    return backend;
  }

  it("접수대기 · 제조중에는 없고, 제조완료에서 강조 없이 보인다 (44px 이상)", async () => {
    await openWith();
    expect(inSummary().queryByRole("button", { name: "재제조" })).toBeNull();
    await press(btn("주문접수"));
    expect(inSummary().queryByRole("button", { name: "재제조" })).toBeNull();
    await press(btn("제조완료"));
    expect(btn("재제조")).toBeEnabled();
    expect(btn("재제조")).not.toHaveClass("bg-blue-600");
    expect(btn("재제조")).toHaveClass("min-h-14");
  });

  it("메뉴와 사유를 모두 골라야 [재제조]가 눌리고, 직접 입력은 비면 막히며 50자 · 줄바꿈 없이 들어간다", async () => {
    await openReady();
    await press(btn("재제조"));
    const confirm = () => inRemake().getByRole("button", { name: "재제조" });
    expect(confirm()).toBeDisabled();
    expect(inRemake().getByRole("button", { name: "닫기" })).toHaveFocus();
    for (const r of REMAKE_TEXTS.reasons) {
      expect(inRemake().getByLabelText(r.label)).toBeInTheDocument();
    }
    await press(inRemake().getByLabelText("이물질"));
    expect(confirm()).toBeDisabled(); // 메뉴를 아직 안 골랐다
    await pickFirstMenu();
    expect(confirm()).toBeEnabled();
    await pickFirstMenu(); // 해제하면 다시 막힌다
    expect(confirm()).toBeDisabled();
    await pickFirstMenu();

    await press(inRemake().getByLabelText("직접 입력"));
    expect(confirm()).toBeDisabled();
    const input = inRemake().getByLabelText(REMAKE_TEXTS.customLabel);
    fireEvent.change(input, { target: { value: "가\n".repeat(60) } });
    expect(input).toHaveValue("가".repeat(50));
    expect(screen.getByText(CANCEL_TEXTS.tooLong)).toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    fireEvent.change(input, { target: { value: "   " } });
    expect(confirm()).toBeDisabled();

    await press(inRemake().getByRole("button", { name: "닫기" }));
    expect(remakeDialog()).toBeNull();
    expect(summary()).toBeInTheDocument();
  });

  it("Esc는 재제조 팝업만 닫고, 요청 중에는 닫지 않는다 (리뷰 ③)", async () => {
    let release = () => {};
    await openReady((b) => ({
      requestRemake: (request) =>
        new Promise((resolve, reject) => {
          release = () =>
            void b.api.requestRemake(request).then(resolve, reject);
        }),
    }));
    await press(btn("재제조"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(remakeDialog()).toBeNull();
    expect(summary()).toBeInTheDocument();

    await press(btn("재제조"));
    await pickFirstMenu();
    await press(inRemake().getByLabelText("이물질"));
    await press(inRemake().getByRole("button", { name: "재제조" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(remakeDialog()).toBeInTheDocument(); // 요청 중
    expect(summary()).toBeInTheDocument();
    release();
    await flush();
    expect(remakeDialog()).toBeNull();
  });

  it("성공하면 팝업을 닫고 「#1 재제조를 등록했습니다.」, 상태는 그대로이며 사유와 구분이 서버로 간다", async () => {
    let sent: unknown = null;
    await openReady((b) => ({
      requestRemake: (request) => {
        sent = request;
        return b.api.requestRemake(request);
      },
    }));
    await press(btn("재제조"));
    await pickFirstMenu();
    await press(inRemake().getByLabelText("고객 주문 실수"));
    await press(inRemake().getByRole("button", { name: "재제조" }));
    expect(remakeDialog()).toBeNull();
    expect(screen.getByText("#1 재제조를 등록했습니다.")).toBeInTheDocument();
    expect(summary()).toBeInTheDocument();
    expect(btn("픽업완료")).toBeEnabled(); // 제조완료 그대로
    expect(sent).toMatchObject({
      items: [{ itemIndex: 0, quantity: 1 }],
      reason: "고객 주문 실수",
      fault: "customer",
    });
  });

  it("메뉴마다 한 줄 · 처음엔 해제, 체크하면 주문 수량으로 시작하고 − / +는 1 ~ 주문 수량, 고른 줄 · 수량만 서버로 간다", async () => {
    let sent: unknown = null;
    const { backend } = renderBoard({
      api: (b) => ({
        requestRemake: (request) => {
          sent = request;
          return b.api.requestRemake(request);
        },
      }),
    });
    await flush();
    act(() => backend.dev.addOrders(3)); // 3번째: 메뉴 5줄, 첫 줄은 2잔 + 옵션
    await flush();
    await openCard(3);
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    await press(btn("재제조"));
    const boxes = inRemake().getAllByRole("checkbox");
    expect(boxes).toHaveLength(5);
    boxes.forEach((b) => expect(b).not.toBeChecked());
    expect(
      inRemake().getByText(
        "샷 추가, 시럽 빼기, 얼음 적게, 컵 두 개로 나눠 담기",
      ),
    ).toBeInTheDocument();
    const name = "아이스 아메리카노(시험)";
    expect(inRemake().queryByLabelText(REMAKE_TEXTS.quantity(name))).toBeNull();

    await press(boxes[0]);
    const qty = () => inRemake().getByLabelText(REMAKE_TEXTS.quantity(name));
    const minus = () =>
      inRemake().getByRole("button", { name: REMAKE_TEXTS.decrease(name) });
    const plus = () =>
      inRemake().getByRole("button", { name: REMAKE_TEXTS.increase(name) });
    expect(qty()).toHaveTextContent("2");
    expect(plus()).toBeDisabled(); // 주문 수량을 넘지 못한다
    expect(plus()).toHaveClass("size-14"); // 44px 이상
    await press(minus());
    expect(qty()).toHaveTextContent("1");
    expect(minus()).toBeDisabled(); // 1 아래로 못 간다
    await press(plus());
    await press(minus());

    await press(boxes[4]); // 초코 쿠키 3개
    await press(inRemake().getByLabelText("이물질"));
    await press(inRemake().getByRole("button", { name: "재제조" }));
    expect(sent).toMatchObject({
      items: [
        { itemIndex: 0, quantity: 1 },
        { itemIndex: 4, quantity: 3 },
      ],
    });
  });

  it("실패하면 팝업을 닫지 않고 고른 사유를 남긴 채 「처리하지 못했습니다…」", async () => {
    await openReady(() => ({
      requestRemake: () => Promise.reject(new Error("서버 오류")),
    }));
    await press(btn("재제조"));
    await pickFirstMenu();
    await press(inRemake().getByLabelText("이물질"));
    await press(inRemake().getByRole("button", { name: "재제조" }));
    expect(screen.getByText(`#1 ${ORDER_MESSAGES.failed}`)).toBeInTheDocument();
    expect(remakeDialog()).toBeInTheDocument();
    expect(inRemake().getByLabelText("이물질")).toBeChecked();
  });

  it("보낼 수 없는 상태(not-allowed)면 아무 반응 없이 두지 않고 실패 문구를 보인다 (리뷰 ②)", async () => {
    const toasts: string[] = [];
    const remake = vi.fn(async () => ({
      ok: false as const,
      reason: "not-allowed" as const,
    }));
    render(
      <OrdersContext.Provider
        value={{ remake, inFlight: {} } as unknown as OrdersContextValue}
      >
        <RemakeDialog
          orderId="o1"
          pickupNumber={7}
          items={[{ name: "아메리카노", quantity: 1 }]}
          onClose={() => {}}
          onToast={(m) => toasts.push(m)}
        />
      </OrdersContext.Provider>,
    );
    await press(screen.getByRole("checkbox"));
    await press(screen.getByLabelText("이물질"));
    await press(screen.getByRole("button", { name: "재제조" }));
    expect(remake).toHaveBeenCalledTimes(1);
    expect(toasts).toEqual([`#7 ${ORDER_MESSAGES.failed}`]);
  });

  it("거절되면 팝업을 닫고 「#1 재제조할 수 없는 주문입니다.」", async () => {
    await openReady((b) => ({
      requestRemake: async (request) => {
        const result = await b.api.requestRemake(request);
        return { kind: "rejected", order: result.order };
      },
    }));
    await press(btn("재제조"));
    await pickFirstMenu();
    await press(inRemake().getByLabelText("이물질"));
    await press(inRemake().getByRole("button", { name: "재제조" }));
    expect(remakeDialog()).toBeNull();
    expect(
      screen.getByText("#1 재제조할 수 없는 주문입니다."),
    ).toBeInTheDocument();
  });
});
