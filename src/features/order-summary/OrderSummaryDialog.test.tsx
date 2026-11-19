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
import { CANCEL_TEXTS } from "./summary-texts";

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
    expect(btn("주문취소")).toBeDisabled(); // 제조완료부터는 막힘 (Q17)
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

  it("픽업완료 카드를 열면 상태 버튼이 없고 인쇄만 막혀 있다", async () => {
    const backend = await openWith();
    await press(btn("주문접수"));
    await press(btn("제조완료"));
    await press(btn("픽업완료"));
    act(() => backend.dev.setConnected(true));
    await press(card(1));
    expect(btn("영수증 인쇄")).toBeDisabled();
    expect(inSummary().queryByRole("button", { name: "주문취소" })).toBeNull();
    expect(
      inSummary().queryByRole("button", {
        name: /주문접수|제조완료|픽업완료$/,
      }),
    ).toBeNull();
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
  it("취소 사유 팝업이 떠 있는 동안 제조완료로 바뀌면 사유 팝업도 닫힌다", async () => {
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
    expect(cancelDialog()).toBeNull();
    expect(
      inSummary().getByRole("button", { name: "주문취소" }),
    ).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" }); // 사유 팝업이 사라진 뒤에도 Esc로 닫힌다
    expect(summary()).toBeNull();
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
