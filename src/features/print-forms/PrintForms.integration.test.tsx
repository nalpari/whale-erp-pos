// 출력 화면 연결 (T12 스펙 3 · 4 · 5장 · 9장). 진짜 OrdersProvider · AppShell + 모의 서버로 접수 → 자동 출력 →
// 실패 띠 · 미출력 → 다시 인쇄, 요약 팝업의 [주문서 인쇄] · [영수증 인쇄]를 끝까지 돌린다.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockOrderFeed } from "../../shared/api/order-feed";
import { OrderHistoryApiContext } from "../../shared/api/order-history-context";
import { createMockOrderBackend } from "../../shared/api/orders";
import { createFakeLogApi } from "../../shared/log/log-api";
import { OrdersProvider } from "../../shared/orders/OrdersProvider";
import type { PrintDocument } from "../../shared/printer/print-lines";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
  type PrinterApi,
} from "../../shared/printer/printer-api";
import type {
  PrinterSettings,
  PrinterSlot,
} from "../../shared/printer/printer-settings";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import { createFakeWindow } from "../../test/fakes";
import { AppShell } from "../app-shell/AppShell";
import { AppShellProvider } from "../app-shell/AppShellContext";
import { PrintFormsProvider } from "./PrintFormsProvider";

vi.mock("@tauri-apps/plugin-log", () => ({
  info: async () => {},
  warn: async () => {},
  error: async () => {},
}));

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

const slot = (name: string, patch: Partial<PrinterSlot> = {}): PrinterSlot => ({
  printerName: name,
  purpose: "",
  printOrder: true,
  printReceipt: false,
  paperWidth: 80,
  ...patch,
});
const settings = (...slots: PrinterSlot[]): PrinterSettings => ({
  version: 1,
  slots: [slots[0] ?? null, slots[1] ?? null, slots[2] ?? null],
});

function renderApp(
  initial: PrinterSettings,
  print: (name: string) => Promise<void> = async () => {},
) {
  const backend = createMockOrderBackend({ delayMs: 0 });
  const printed: { printerName: string; doc: PrintDocument }[] = [];
  const printerApi: PrinterApi = {
    ...createFakePrinterApi(),
    printDocument: async (printerName, doc) => {
      printed.push({ printerName, doc });
      await print(printerName);
    },
  };
  const sound = { playNewOrder: vi.fn(), playWarning: vi.fn() };
  render(
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={backend.storeStatusApi}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={createMemoryTokenStore()}
      printerApi={printerApi}
      printerSettingsStore={createMemoryPrinterSettingsStore(initial)}
      logApi={createFakeLogApi()}
      initialSession={STORE}
    >
      <OrdersProvider
        orderApi={backend.api}
        orderFeed={createMockOrderFeed(backend)}
        storeStatusApi={backend.storeStatusApi}
        sound={sound}
      >
        <PrintFormsProvider>
          <OrderHistoryApiContext.Provider value={backend.historyApi}>
            <AppShell />
          </OrderHistoryApiContext.Provider>
        </PrintFormsProvider>
      </OrdersProvider>
    </AppShellProvider>,
  );
  return { backend, printed, sound };
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
const firstText = (doc: PrintDocument) => doc.lines[0]?.text ?? "";

/** 주문 1건을 넣고 [주문접수]까지 누른다. */
async function acceptFirst(app: ReturnType<typeof renderApp>) {
  await flush();
  act(() => app.backend.dev.addOrders(1));
  await flush();
  await press(within(card(1)).getByRole("button", { name: "주문접수" }));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("자동 출력 · 실패 · 다시 인쇄", () => {
  it("접수하면 「주문서」 체크된 슬롯마다 한 장씩 나오고 접수는 그대로다", async () => {
    const app = renderApp(settings(slot("A"), slot("B", { paperWidth: 58 })));
    await acceptFirst(app);
    expect(app.printed.map((p) => p.printerName)).toEqual(["A", "B"]);
    expect(firstText(app.printed[0].doc)).toBe(
      "픽업오더 주문서 (주방 / 바리스타용)",
    );
    expect(within(card(1)).getByText("제조중")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    // 제조완료로 바꿔도 다시 뽑지 않는다.
    await press(within(card(1)).getByRole("button", { name: "제조완료" }));
    expect(app.printed).toHaveLength(2);
  });

  it("실패하면 경고음 · 빨간 띠 · 미출력, 접수는 그대로", async () => {
    const app = renderApp(settings(slot("SEWOO")), async () => {
      throw "프린터를 찾을 수 없음";
    });
    await acceptFirst(app);
    expect(within(card(1)).getByText("제조중")).toBeInTheDocument();
    expect(within(card(1)).getByText("미출력")).toBeInTheDocument();
    expect(app.sound.playWarning).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "주문서를 출력하지 못했습니다. (슬롯 1 SEWOO: 프린터를 찾을 수 없음)",
    );
  });

  it("30초 안에 끝나지 않으면 「출력 결과를 확인할 수 없습니다.」 띠 + 미출력", async () => {
    const app = renderApp(settings(slot("SEWOO")), () => new Promise(() => {}));
    await acceptFirst(app);
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "출력 결과를 확인할 수 없습니다. (슬롯 1 SEWOO)",
    );
    expect(within(card(1)).getByText("미출력")).toBeInTheDocument();
    expect(app.sound.playWarning).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "다시 인쇄" })).toBeEnabled();
  });

  it("결과를 모르는 슬롯이 다른 실패와 섞이면 이유를 붙여 구분한다", async () => {
    const app = renderApp(settings(slot("A"), slot("B")), (name) =>
      name === "A"
        ? new Promise(() => {})
        : Promise.reject("프린터를 찾을 수 없음"),
    );
    await acceptFirst(app);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "주문서를 출력하지 못했습니다. (슬롯 1 A: 출력 결과를 확인할 수 없음, 슬롯 2 B: 프린터를 찾을 수 없음)",
    );
  });

  it("[다시 인쇄]는 실패한 슬롯에만 내고, 성공하면 띠 · 꼬리표를 지운다", async () => {
    let broken = true;
    const app = renderApp(settings(slot("A"), slot("B")), async (name) => {
      if (name === "B" && broken) throw "인쇄를 시작하지 못함";
    });
    await acceptFirst(app);
    expect(screen.getByRole("alert")).toHaveTextContent("슬롯 2 B");
    expect(screen.getByRole("alert")).not.toHaveTextContent("슬롯 1");
    app.printed.length = 0;
    broken = false;
    await press(screen.getByRole("button", { name: "다시 인쇄" }));
    expect(app.printed.map((p) => p.printerName)).toEqual(["B"]);
    expect(firstText(app.printed[0].doc)).not.toContain("재출력");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(card(1)).queryByText("미출력")).toBeNull();
  });

  it("[×]는 띠만 닫고 「미출력」 꼬리표는 남긴다", async () => {
    const app = renderApp(settings(slot("A")), async () => {
      throw "프린터를 찾을 수 없음";
    });
    await acceptFirst(app);
    await press(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(card(1)).getByText("미출력")).toBeInTheDocument();
  });
});

describe("요약 팝업의 인쇄 버튼", () => {
  async function openSummary(app: ReturnType<typeof renderApp>) {
    await flush();
    act(() => app.backend.dev.addOrders(1));
    await flush();
    await press(card(1));
    return screen.getByRole("dialog");
  }

  it("접수대기에서는 [주문서 인쇄]가 막히고, 접수 뒤에는 「[재출력]」으로 다시 뽑는다", async () => {
    const app = renderApp(settings(slot("A")));
    const dialog = await openSummary(app);
    expect(
      within(dialog).getByRole("button", { name: "주문서 인쇄" }),
    ).toBeDisabled();
    await press(within(dialog).getByRole("button", { name: "주문접수" }));
    app.printed.length = 0;
    await press(within(dialog).getByRole("button", { name: "주문서 인쇄" }));
    expect(app.printed).toHaveLength(1);
    expect(firstText(app.printed[0].doc)).toMatch(/^\[재출력\] \d\d:\d\d$/);
  });

  it("「주문서」 체크된 슬롯이 없으면 토스트", async () => {
    const app = renderApp(settings(slot("A", { printOrder: false })));
    const dialog = await openSummary(app);
    await press(within(dialog).getByRole("button", { name: "주문접수" }));
    await press(within(dialog).getByRole("button", { name: "주문서 인쇄" }));
    expect(
      screen.getByText("주문서를 출력할 프린터가 없습니다."),
    ).toBeInTheDocument();
    expect(app.printed).toEqual([]);
  });

  it("「영수증」 체크가 없으면 [영수증 인쇄]가 막힌다 (접수대기에서도)", async () => {
    const app = renderApp(settings(slot("A")));
    const dialog = await openSummary(app);
    expect(
      within(dialog).getByRole("button", { name: "영수증 인쇄" }),
    ).toBeDisabled();
  });

  it("[영수증 인쇄] → 미리보기 → 앞선 슬롯 한 대로 출력 → 토스트 · 팝업 닫힘", async () => {
    const app = renderApp(
      settings(
        slot("A"),
        slot("B", { printOrder: false, printReceipt: true }),
        slot("C", { printOrder: false, printReceipt: true }),
      ),
    );
    const dialog = await openSummary(app); // 접수대기에서도 영수증은 뽑을 수 있다 (Q27)
    await press(within(dialog).getByRole("button", { name: "영수증 인쇄" }));
    const preview = screen.getByRole("dialog", { name: "영수증 미리보기" });
    expect(within(preview).getByText("웨일커피 시험점")).toBeInTheDocument();
    await press(within(preview).getByRole("button", { name: "영수증 인쇄" }));
    expect(app.printed.map((p) => p.printerName)).toEqual(["B"]);
    expect(
      screen.queryByRole("dialog", { name: "영수증 미리보기" }),
    ).toBeNull();
    expect(screen.getByText("영수증을 출력했습니다.")).toBeInTheDocument();
  });

  it("영수증 출력 실패는 팝업 안에 문구를 보이고 팝업을 닫지 않는다 (경고음 · 띠 없음)", async () => {
    const app = renderApp(
      settings(slot("SEWOO", { printOrder: false, printReceipt: true })),
      async () => {
        throw "인쇄를 시작하지 못함";
      },
    );
    const dialog = await openSummary(app);
    await press(within(dialog).getByRole("button", { name: "영수증 인쇄" }));
    const preview = screen.getByRole("dialog", { name: "영수증 미리보기" });
    await press(within(preview).getByRole("button", { name: "영수증 인쇄" }));
    expect(within(preview).getByRole("alert")).toHaveTextContent(
      "영수증을 출력하지 못했습니다. (슬롯 1 SEWOO: 인쇄를 시작하지 못함)",
    );
    expect(app.sound.playWarning).not.toHaveBeenCalled();
    expect(screen.queryByText("미출력")).toBeNull();
  });

  it("영수증 정보를 못 읽으면 [다시 시도]를 보인다", async () => {
    const app = renderApp(
      settings(slot("A", { printOrder: false, printReceipt: true })),
    );
    const dialog = await openSummary(app);
    const fetchDetail = vi
      .spyOn(app.backend.historyApi, "fetchDetail")
      .mockRejectedValueOnce(new Error("x"));
    await press(within(dialog).getByRole("button", { name: "영수증 인쇄" }));
    const preview = screen.getByRole("dialog", { name: "영수증 미리보기" });
    expect(within(preview).getByRole("alert")).toHaveTextContent(
      "영수증 정보를 불러오지 못했습니다.",
    );
    expect(
      within(preview).getByRole("button", { name: "영수증 인쇄" }),
    ).toBeDisabled();
    await press(within(preview).getByRole("button", { name: "다시 시도" }));
    expect(fetchDetail).toHaveBeenCalledTimes(2);
    expect(within(preview).getByText("웨일커피 시험점")).toBeInTheDocument();
  });
});

describe("재제조 주문서 (T21)", () => {
  async function remakeFromSummary(app: ReturnType<typeof renderApp>) {
    await acceptFirst(app);
    await press(card(1));
    const dialog = screen.getByRole("dialog", { name: /^#1/ });
    await press(within(dialog).getByRole("button", { name: "제조완료" }));
    app.printed.length = 0;
    await press(within(dialog).getByRole("button", { name: "재제조" }));
    const remake = screen.getByRole("dialog", { name: "재제조하시겠습니까?" });
    await press(within(remake).getByRole("checkbox"));
    await press(within(remake).getByRole("radio", { name: "이물질" }));
    await press(within(remake).getByRole("button", { name: "재제조" }));
  }

  it("성공하면 「주문서」 프린터 모두로 「[재제조]」 · 「사유」 주문서가 나가고 상태는 그대로다", async () => {
    const app = renderApp(
      settings(slot("A"), slot("B"), slot("C", { printOrder: false })),
    );
    await remakeFromSummary(app);
    expect(app.printed.map((p) => p.printerName)).toEqual(["A", "B"]);
    expect(firstText(app.printed[0].doc)).toMatch(/^\[재제조\] \d\d:\d\d$/);
    expect(app.printed[0].doc.lines[1].text).toBe("사유: 이물질");
    expect(screen.getByText("#1 재제조를 등록했습니다.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /#1\s*제조완료/ }),
    ).toBeInTheDocument();
  });

  it("서버가 거절하면 주문서를 뽑지 않는다 (리뷰 ③)", async () => {
    const app = renderApp(settings(slot("A")));
    const real = app.backend.api.requestRemake.bind(app.backend.api);
    vi.spyOn(app.backend.api, "requestRemake").mockImplementation(
      async (request) => ({
        kind: "rejected",
        order: (await real(request)).order,
      }),
    );
    await remakeFromSummary(app);
    expect(app.printed).toEqual([]);
    expect(
      screen.getByText("#1 재제조할 수 없는 주문입니다."),
    ).toBeInTheDocument();
  });

  it("주문내역 상세에서 오늘 픽업완료를 재제조해도 「주문서」 프린터로 나간다 (리뷰 ③)", async () => {
    const app = renderApp(settings(slot("A")));
    await acceptFirst(app);
    await press(card(1));
    const summaryDialog = screen.getByRole("dialog", { name: /^#1/ });
    await press(
      within(summaryDialog).getByRole("button", { name: "제조완료" }),
    );
    await press(
      within(summaryDialog).getByRole("button", { name: "픽업완료" }),
    );
    await press(screen.getByRole("tab", { name: "주문내역" }));
    await press(
      screen
        .getAllByRole("listitem")
        .map((li) => within(li).getByRole("button"))
        .find((b) => b.textContent?.startsWith("#1"))!,
    );
    app.printed.length = 0;
    await press(screen.getByRole("button", { name: "재제조" }));
    const remake = screen.getByRole("dialog", { name: "재제조하시겠습니까?" });
    await press(within(remake).getByRole("checkbox"));
    await press(within(remake).getByRole("radio", { name: "맛 · 품질 문제" }));
    await press(within(remake).getByRole("button", { name: "재제조" }));
    expect(app.printed.map((p) => p.printerName)).toEqual(["A"]);
    expect(firstText(app.printed[0].doc)).toMatch(/^\[재제조\] \d\d:\d\d$/);
  });

  it("서버가 실패하면 주문서를 뽑지 않는다", async () => {
    const app = renderApp(settings(slot("A")));
    vi.spyOn(app.backend.api, "requestRemake").mockRejectedValue(
      new Error("서버 오류"),
    );
    await remakeFromSummary(app);
    expect(app.printed).toEqual([]);
    expect(screen.getByText(/#1 처리하지 못했습니다/)).toBeInTheDocument();
  });
});
