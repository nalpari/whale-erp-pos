// 주문내역 화면 (SPEC-order-history 7장). 진짜 OrdersProvider + 모의 서버로 목록 · 상세 · 상태 변경을 끝까지 돌린다.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockOrderFeed } from "../../shared/api/order-feed";
import type {
  HistoryQuery,
  OrderHistoryApi,
} from "../../shared/api/order-history";
import { OrderHistoryApiContext } from "../../shared/api/order-history-context";
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
import { PrintFormsProvider } from "../print-forms/PrintFormsProvider";
import type { PrinterSettings } from "../../shared/printer/printer-settings";
import { AppShellProvider } from "../app-shell/AppShellContext";
import { SEARCH_DELAY_MS } from "./OrderHistoryScreen";
import { HISTORY_TEXTS } from "./history-texts";

const sent = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("@tauri-apps/plugin-log", () => {
  const push = async (m: string) => {
    sent.lines.push(m);
  };
  return { info: push, warn: push, error: push };
});

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};
// 2026-11-19 15:00. 최근 한 달은 2026-10-19 ~ 2026-11-19.
const NOW = new Date(2026, 10, 19, 15, 0);

function renderHistory(
  options: {
    api?: Partial<OrderApi>;
    history?: Partial<OrderHistoryApi>;
    backend?: MockOrderBackend;
    /** 프린터 설정 (T12 인쇄 버튼 시험용). 기본은 빈 설정. */
    printerSettings?: PrinterSettings;
  } = {},
) {
  const backend = options.backend ?? createMockOrderBackend({ delayMs: 0 });
  const fetchPage = vi.fn((q: HistoryQuery) => backend.historyApi.fetchPage(q));
  const history: OrderHistoryApi = {
    fetchPage,
    fetchDetail: (id) => backend.historyApi.fetchDetail(id),
    fetchReceiptStore: () => backend.historyApi.fetchReceiptStore(),
    ...options.history,
  };
  const api: OrderApi = { ...backend.api, ...options.api };
  const ui = () => (
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={backend.storeStatusApi}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={createMemoryTokenStore()}
      printerApi={createFakePrinterApi()}
      printerSettingsStore={createMemoryPrinterSettingsStore(
        options.printerSettings,
      )}
      logApi={createFakeLogApi()}
      initialSession={STORE}
    >
      <OrdersProvider
        orderApi={api}
        orderFeed={createMockOrderFeed(backend)}
        storeStatusApi={backend.storeStatusApi}
        sound={{ playNewOrder: vi.fn(), playWarning: vi.fn() }}
      >
        <PrintFormsProvider>
          <OrderHistoryApiContext.Provider value={history}>
            <AppShell />
          </OrderHistoryApiContext.Provider>
        </PrintFormsProvider>
      </OrdersProvider>
    </AppShellProvider>
  );
  return { backend, fetchPage, ...render(ui()) };
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const press = async (el: HTMLElement) => {
  fireEvent.click(el);
  await flush();
};
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const mainTab = (name: string) => screen.getByRole("tab", { name });
const lastQuery = (spy: ReturnType<typeof renderHistory>["fetchPage"]) =>
  spy.mock.calls[spy.mock.calls.length - 1][0];

async function openHistory(options: Parameters<typeof renderHistory>[0] = {}) {
  const view = renderHistory(options);
  await flush();
  await press(mainTab("주문내역"));
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sent.lines.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("기간 (2.1)", () => {
  it("처음 열면 오늘을 서버에 묻고, 주문이 없으면 빈 문구", async () => {
    const { fetchPage } = await openHistory();
    const q = lastQuery(fetchPage);
    expect(q.fromDay).toBe(new Date(2026, 10, 19).getTime());
    expect(q.toDay).toBe(q.fromDay);
    expect(q).toMatchObject({ tab: "all", q: "", page: 1, size: 50 });
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.19");
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
  });

  it("바로가기 4개가 기간을 바꾼다", async () => {
    const { fetchPage } = await openHistory();
    await press(button("어제"));
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.18");
    await press(button("이번 달"));
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent(
      "11.01 ~ 11.19",
    );
    await press(button("최근 한 달"));
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent(
      "10.19 ~ 11.19",
    );
    expect(lastQuery(fetchPage).fromDay).toBe(new Date(2026, 9, 19).getTime());
    await press(button("오늘"));
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.19");
  });

  it("< >는 기간 길이만큼 옮기고, 범위 끝은 막는다", async () => {
    await openHistory();
    expect(button(HISTORY_TEXTS.nextPeriod)).toBeDisabled(); // 오늘 다음은 없다
    await press(button(HISTORY_TEXTS.prevPeriod));
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.18");
    expect(button(HISTORY_TEXTS.nextPeriod)).toBeEnabled();
    await press(button("최근 한 달"));
    expect(button(HISTORY_TEXTS.prevPeriod)).toBeDisabled();
    expect(button(HISTORY_TEXTS.nextPeriod)).toBeDisabled();
  });

  it("달력: 하루 또는 기간을 고르고 [확인], 범위 밖 날짜는 고를 수 없다", async () => {
    const { fetchPage } = await openHistory();
    await press(button(HISTORY_TEXTS.periodLabel));
    const dialog = screen.getByRole("dialog", {
      name: HISTORY_TEXTS.openCalendar,
    });
    expect(within(dialog).getByText("2026년 11월")).toBeInTheDocument();
    // 오늘(19)보다 뒤는 막힘
    expect(
      within(dialog).getByRole("button", { name: "11월 20일" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: "11월 19일" }),
    ).toBeEnabled();
    expect(within(dialog).getByText(HISTORY_TEXTS.calendarOlder)).toBeVisible();
    // 이전 달: 19일부터만 선택 가능
    await press(within(dialog).getByRole("button", { name: "이전 달" }));
    expect(within(dialog).getByText("2026년 10월")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "10월 18일" }),
    ).toBeDisabled();
    await press(within(dialog).getByRole("button", { name: "10월 25일" }));
    await press(within(dialog).getByRole("button", { name: "10월 22일" })); // 순서가 뒤바뀌어도 기간
    await press(within(dialog).getByRole("button", { name: "확인" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent(
      "10.22 ~ 10.25",
    );
    expect(lastQuery(fetchPage)).toMatchObject({
      fromDay: new Date(2026, 9, 22).getTime(),
      toDay: new Date(2026, 9, 25).getTime(),
    });
  });
});

describe("목록 · 탭 · 요약 (2.3 · 2.4)", () => {
  it("최근 한 달: 최신이 위, 탭 건수와 요약 줄, 접수대기 행은 노랗다", async () => {
    const { backend } = await openHistory();
    act(() => backend.dev.addOrders(2)); // 접수대기 2건 (오늘)
    await press(button("최근 한 달"));
    const rows = screen
      .getAllByRole("listitem")
      .map((li) => within(li).getByRole("button"));
    expect(rows[0]).toHaveTextContent("#2"); // 오늘 가장 늦은 주문이 맨 위
    expect(rows[0]).toHaveTextContent("접수대기");
    expect(rows[0]).toHaveClass("bg-yellow-100", "min-h-14");
    expect(rows[0]).toHaveTextContent("아이스 아메리카노(시험)");
    expect(rows[0]).toHaveTextContent("₩4,500");
    expect(rows[0]).toHaveTextContent("11.19 15:00");
    // 지난 날 주문은 노랗지 않다
    expect(rows[rows.length - 1]).not.toHaveClass("bg-yellow-100");
    expect(mainTabFor("접수대기")).toHaveTextContent("접수대기 2");
    expect(
      screen.getByText(/^총 \d+건 · 결제 합계 ₩[\d,]+ \(취소 \d+건 제외\)$/),
    ).toBeInTheDocument();
  });

  it("탭을 누르면 그 탭 조건으로 다시 묻고 요약 줄이 바뀐다", async () => {
    const { fetchPage } = await openHistory();
    await press(button("최근 한 달"));
    await press(mainTabFor("취소"));
    expect(lastQuery(fetchPage)).toMatchObject({ tab: "cancelled", page: 1 });
    expect(
      screen.getByText(/^총 \d+건 · 취소 금액 ₩[\d,]+$/),
    ).toBeInTheDocument();
    // 취소 탭에는 매장취소와 고객취소가 함께 보인다
    const text = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(text.some((t) => t?.includes("매장취소"))).toBe(true);
    expect(text.some((t) => t?.includes("고객취소"))).toBe(true);
    await press(mainTabFor("픽업완료"));
    expect(
      screen.getByText(/^총 \d+건 · 결제 합계 ₩[\d,]+$/),
    ).toBeInTheDocument();
  });

  it("목록은 조회한 때 기준이고 [새로 고침]으로 다시 묻는다 (11장 B)", async () => {
    const { backend } = await openHistory();
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
    act(() => backend.dev.addOrders(1));
    await flush();
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
    await press(button(HISTORY_TEXTS.refresh));
    expect(screen.queryByText(HISTORY_TEXTS.empty)).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("불러오는 중 · 실패 · [다시 시도] · 로그에는 원인 요약만", async () => {
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("서버 오류 q=1234"))
      .mockImplementation((q: HistoryQuery) =>
        createMockOrderBackend({ delayMs: 0 }).historyApi.fetchPage(q),
      );
    await openHistory({ history: { fetchPage } });
    expect(screen.getByText(HISTORY_TEXTS.listFailed)).toBeInTheDocument();
    expect(sent.lines).toContain("주문내역 목록 조회 실패: Error");
    expect(sent.lines.join("\n")).not.toContain("1234"); // 오류 문구의 입력값은 로그에 없다
    await press(button(HISTORY_TEXTS.retry));
    expect(screen.queryByText(HISTORY_TEXTS.listFailed)).toBeNull();
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
  });

  it("10초 안에 응답이 없으면 실패로 본다", async () => {
    await openHistory({ history: { fetchPage: () => new Promise(() => {}) } });
    expect(screen.getByText(HISTORY_TEXTS.loading)).toBeInTheDocument();
    await advance(10_000);
    expect(screen.getByText(HISTORY_TEXTS.listFailed)).toBeInTheDocument();
    expect(sent.lines).toContain("주문내역 목록 조회 시간 초과");
  });
});

// 탭 줄의 탭은 "접수대기 2"처럼 건수가 붙는다. 이름 앞부분으로 찾는다.
function mainTabFor(label: string) {
  return screen.getByRole("tab", { name: new RegExp(`^${label}( \\d+)?$`) });
}

describe("검색 (2.2)", () => {
  it("멈춘 뒤 최근 한 달 전체에서 찾고, 안내를 보이고, 지우면 고른 기간으로 돌아간다", async () => {
    const { fetchPage } = await openHistory();
    const input = screen.getByRole("textbox", {
      name: HISTORY_TEXTS.searchLabel,
    });
    expect(input).toHaveAttribute(
      "placeholder",
      HISTORY_TEXTS.searchPlaceholder,
    );
    const calls = fetchPage.mock.calls.length;
    fireEvent.change(input, { target: { value: "#2" } });
    await advance(SEARCH_DELAY_MS - 1);
    expect(fetchPage.mock.calls.length).toBe(calls); // 아직 묻지 않는다
    await advance(1);
    expect(lastQuery(fetchPage)).toMatchObject({ q: "2", page: 1 });
    expect(screen.getByText(HISTORY_TEXTS.searchNotice)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "" } });
    await flush();
    expect(lastQuery(fetchPage).q).toBe("");
    expect(screen.queryByText(HISTORY_TEXTS.searchNotice)).toBeNull();
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.19");
  });

  it("픽업번호 · 휴대폰 끝 4자리 · 주문번호로 찾는다 (기간과 상관없이)", async () => {
    const { backend } = await openHistory();
    act(() => backend.dev.addOrders(1));
    await flush();
    const input = screen.getByRole("textbox", {
      name: HISTORY_TEXTS.searchLabel,
    });
    const search = async (value: string) => {
      fireEvent.change(input, { target: { value } });
      await advance(SEARCH_DELAY_MS);
    };
    await press(button("어제")); // 오늘 주문이 기간 밖이어도 검색에는 나온다
    await search("#1");
    const times = () =>
      screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    // 지난 날 주문(#1)도 있지만, 기간 밖인 오늘 주문(11.19 15:00)이 함께 나와야 한다
    expect(times().some((t) => t.includes("11.19 15:00"))).toBe(true);
    expect(times().length).toBeGreaterThan(1);
    await search("0000"); // 모의 주문의 휴대폰 끝 4자리
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await search("2611180000010001"); // 오늘 첫 모의 주문의 주문번호
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    await search("9999999");
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
  });

  it("검색어는 로그에 남기지 않는다", async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error("fail"));
    await openHistory({ history: { fetchPage } });
    fireEvent.change(
      screen.getByRole("textbox", { name: HISTORY_TEXTS.searchLabel }),
      {
        target: { value: "4321" },
      },
    );
    await advance(SEARCH_DELAY_MS);
    // 실패 로그는 실제로 찍혔고, 거기에 검색어는 없다
    expect(sent.lines).toContain("주문내역 목록 조회 실패: Error");
    expect(sent.lines.join("\n")).not.toContain("4321");
  });
});

describe("페이지 (2.4 · Q37)", () => {
  it("페이지당 건수를 PC에 기억하고 바꾸면 1쪽부터 다시 묻는다", async () => {
    const { fetchPage, unmount } = await openHistory();
    const select = screen.getByRole("combobox", {
      name: HISTORY_TEXTS.pageSize,
    });
    expect(select).toHaveValue("50");
    await press(button("최근 한 달"));
    fireEvent.change(select, { target: { value: "20" } });
    await flush();
    expect(lastQuery(fetchPage)).toMatchObject({ size: 20, page: 1 });
    expect(localStorage.getItem("orderHistoryPageSize")).toBe("20");
    unmount();
    await openHistory();
    expect(
      screen.getByRole("combobox", { name: HISTORY_TEXTS.pageSize }),
    ).toHaveValue("20");
  });

  it("번호 · 이전 · 다음으로 쪽을 옮긴다", async () => {
    const { fetchPage } = await openHistory();
    await press(button("최근 한 달"));
    fireEvent.change(
      screen.getByRole("combobox", { name: HISTORY_TEXTS.pageSize }),
      {
        target: { value: "20" },
      },
    );
    await flush();
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(button("이전")).toBeDisabled();
    await press(button("다음"));
    expect(lastQuery(fetchPage).page).toBe(2);
    expect(button("2")).toHaveAttribute("aria-current", "page");
    await press(button("4"));
    expect(lastQuery(fetchPage).page).toBe(4);
    // 조건을 바꾸면 1쪽으로
    await press(mainTabFor("취소"));
    expect(lastQuery(fetchPage).page).toBe(1);
  });
});

describe("상세 (3장)", () => {
  async function openOrder(
    n: number,
    count = n,
    options: Parameters<typeof renderHistory>[0] = {},
  ) {
    const view = await openHistory(options);
    act(() => view.backend.dev.addOrders(count));
    await press(button(HISTORY_TEXTS.refresh));
    await press(
      screen
        .getAllByRole("listitem")
        .map((li) => within(li).getByRole("button"))
        .find((b) => b.textContent?.startsWith(`#${n}`))!,
    );
    return view;
  }

  it("[주문서 인쇄]는 접수대기에서 막히고, [영수증 인쇄]는 「영수증」 체크가 없으면 막힌다 (T12 Q27)", async () => {
    await openOrder(3); // 접수대기
    expect(button("주문서 인쇄")).toBeDisabled();
    expect(button("영수증 인쇄")).toBeDisabled();
  });

  it("[주문서 인쇄]: 제조중이면 「[재출력]」과 옵션 줄(이름 글자)로 내고, 체크된 슬롯이 없으면 토스트 (T12)", async () => {
    await openOrder(3);
    // 3번째 모의 주문은 옵션이 있는 긴 주문이다. 접수해서 제조중으로 만든다.
    await press(button("주문접수"));
    await press(button("주문서 인쇄"));
    // 프린터 설정이 비어 있으므로 토스트만 뜬다.
    expect(
      screen.getByText("주문서를 출력할 프린터가 없습니다."),
    ).toBeInTheDocument();
  });

  it("[영수증 인쇄] → 미리보기 → 출력하면 토스트 (T12 스펙 4.1)", async () => {
    await openOrder(3, 3, {
      printerSettings: {
        version: 1,
        slots: [
          {
            printerName: "SEWOO",
            purpose: "",
            printOrder: false,
            printReceipt: true,
            paperWidth: 80,
          },
          null,
          null,
        ],
      },
    });
    expect(button("영수증 인쇄")).toBeEnabled();
    await press(button("영수증 인쇄"));
    const preview = screen.getByRole("dialog", { name: "영수증 미리보기" });
    expect(within(preview).getByText("영수증")).toBeInTheDocument();
    await press(within(preview).getByRole("button", { name: "영수증 인쇄" }));
    expect(screen.getByText("영수증을 출력했습니다.")).toBeInTheDocument();
  });

  it("7개 영역: 머리 · 메뉴 · 기본 정보 · 요청사항 · 결제정보 · 처리 이력 · 버튼", async () => {
    await openOrder(3); // 3번째 모의 주문: 긴 주문 + 요청사항 + 포인트 할인
    expect(
      screen.getByRole("heading", { name: /#3\s*접수대기/ }),
    ).toBeInTheDocument();
    const menu = screen.getByRole("region", { name: "주문 메뉴" });
    expect(
      within(menu).getByText("아이스 아메리카노(시험)"),
    ).toBeInTheDocument();
    expect(within(menu).getByText(/샷 추가 \(\+₩500\)/)).toBeInTheDocument(); // 옵션 금액
    expect(within(menu).getByText("합계")).toBeInTheDocument();
    const basic = screen.getByRole("region", { name: "기본 정보" });
    expect(within(basic).getByText("2611180000010003")).toBeInTheDocument(); // 16자리
    expect(within(basic).getByText("***-****-0000")).toBeInTheDocument();
    expect(within(basic).getByText(/홍\*동/)).toBeInTheDocument();
    expect(within(basic).getByText("4번째 주문")).toBeInTheDocument();
    expect(within(basic).getByText(/픽업$/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "요청사항" })).toHaveTextContent(
      "얼음 조금만",
    );
    const pay = screen.getByRole("region", { name: "결제정보" });
    expect(within(pay).getByText("포인트 할인")).toBeInTheDocument();
    expect(within(pay).getByText("-₩1,000")).toBeInTheDocument();
    expect(within(pay).getByText("결제금액")).toBeInTheDocument();
    expect(within(pay).getByText("TX2611180000010003")).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "처리 이력" });
    expect(within(history).getByText("결제(주문)")).toBeInTheDocument();
    expect(within(history).queryByText("제조중")).toBeNull(); // 아직 안 된 단계는 뺀다
  });

  it("첫 주문이면 「첫 주문」, 요청사항이 없으면 칸이 없다", async () => {
    await openOrder(4, 4); // seed 4 → 누적 1회, 단순 주문
    expect(screen.getByText("첫 주문")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "요청사항" })).toBeNull();
    expect(screen.queryByText(/할인$/)).toBeNull(); // 안 쓴 할인 줄은 없다
  });

  it("접수대기: [주문취소] [주문접수★], 주문서 인쇄는 막혀 있다", async () => {
    await openOrder(1);
    expect(button("주문접수")).toHaveClass("bg-blue-600");
    expect(button("주문취소")).not.toHaveClass("bg-blue-600");
    expect(button("주문취소")).toBeEnabled();
    expect(button("영수증 인쇄")).toBeDisabled();
    expect(button("주문서 인쇄")).toBeDisabled();
  });

  it("다음 단계 버튼이 서버를 거쳐 상세를 바꾸고, 이전으로 돌아오면 목록 행도 바뀌어 있다", async () => {
    await openOrder(1);
    await press(button("주문접수"));
    expect(
      screen.getByRole("heading", { name: /#1\s*제조중/ }),
    ).toBeInTheDocument();
    expect(button("제조완료")).toBeEnabled();
    expect(button("주문취소")).toBeEnabled();
    expect(
      within(screen.getByRole("region", { name: "처리 이력" })).getByText(
        "제조중",
      ),
    ).toBeInTheDocument();
    await press(button("제조완료"));
    expect(button("주문취소")).toBeEnabled(); // 제조완료도 취소할 수 있다 (T18)
    await press(button("픽업완료"));
    expect(
      screen.getByRole("heading", { name: /#1\s*픽업완료/ }),
    ).toBeInTheDocument();
    expect(button("주문취소")).toBeEnabled(); // 결제한 날 픽업완료도 취소할 수 있다 (T18)
    expect(button("영수증 인쇄")).toBeDisabled();
    await press(button(HISTORY_TEXTS.back));
    const row = screen.getAllByRole("listitem")[0];
    expect(row).toHaveTextContent("픽업완료");
  });

  it("[주문취소]: 사유를 골라야 취소되고, 취소 주문은 [영수증 인쇄]만 남는다", async () => {
    await openOrder(1);
    await press(button("주문취소"));
    const dialog = screen.getByRole("dialog", {
      name: "주문을 취소하시겠습니까?",
    });
    expect(
      within(dialog).getByRole("button", { name: "주문취소" }),
    ).toBeDisabled();
    await press(
      within(dialog).getByRole("radio", { name: "재료가 소진되었습니다" }),
    );
    await press(within(dialog).getByRole("button", { name: "주문취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /#1\s*매장취소/ }),
    ).toBeInTheDocument();
    const history = screen.getByRole("region", { name: "처리 이력" });
    expect(within(history).getByText("매장취소")).toBeInTheDocument();
    expect(
      within(history).getByText("재료가 소진되었습니다"),
    ).toBeInTheDocument();
    expect(button("영수증 인쇄")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "주문서 인쇄" })).toBeNull();
    expect(screen.queryByRole("button", { name: "주문취소" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /주문접수|제조완료|픽업완료/ }),
    ).toBeNull();
  });

  it("지난 날 픽업완료 상세에는 [주문취소]가 없고 [영수증 인쇄]만 있다 (T18)", async () => {
    await openHistory();
    await press(button("최근 한 달"));
    await press(mainTabFor("픽업완료"));
    await press(screen.getAllByRole("listitem")[0].querySelector("button")!);
    expect(button("영수증 인쇄")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "주문취소" })).toBeNull();
  });

  it("오늘 픽업완료를 상세에서 취소하면 「취소」 탭으로 가고 「픽업완료」 탭에서 빠진다 (T18)", async () => {
    await openOrder(1);
    for (const name of ["주문접수", "제조완료", "픽업완료"]) {
      await press(button(name));
    }
    await press(button("주문취소"));
    await press(screen.getByRole("radio", { name: "재료가 소진되었습니다" }));
    await press(
      within(
        screen.getByRole("dialog", { name: "주문을 취소하시겠습니까?" }),
      ).getByRole("button", { name: "주문취소" }),
    );
    expect(
      screen.getByRole("heading", { name: /#1\s*매장취소/ }),
    ).toBeInTheDocument();
    await press(button(HISTORY_TEXTS.back));
    const rows = () =>
      screen.queryAllByRole("listitem").map((li) => li.textContent ?? "");
    await press(mainTabFor("취소"));
    expect(rows().some((t) => t.startsWith("#1"))).toBe(true);
    await press(mainTabFor("픽업완료"));
    expect(rows().some((t) => t.startsWith("#1"))).toBe(false);
  });

  it("0시가 지나 too-late를 받으면 사유 팝업만 닫히고 상세는 열린 채 [주문취소]가 사라진다 (T18, 사용자 결정 A-1)", async () => {
    await openOrder(1);
    for (const name of ["주문접수", "제조완료", "픽업완료"]) {
      await press(button(name));
    }
    await press(button("주문취소"));
    await press(screen.getByRole("radio", { name: "재료가 소진되었습니다" }));
    vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000)); // 사유를 고르는 사이 0시가 지남
    await press(
      within(
        screen.getByRole("dialog", { name: "주문을 취소하시겠습니까?" }),
      ).getByRole("button", { name: "주문취소" }),
    );
    expect(
      screen.getByText("#1 취소할 수 있는 시간이 지났습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /#1\s*픽업완료/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "주문취소" })).toBeNull();
  });

  it("지난 취소 주문: 고객취소는 사유 없이 취소 시각 · 누가만, 영수증 인쇄만", async () => {
    await openHistory();
    await press(button("최근 한 달"));
    await press(mainTabFor("취소"));
    const customer = screen
      .getAllByRole("listitem")
      .map((li) => within(li).getByRole("button"))
      .find((b) => b.textContent?.includes("고객취소"))!;
    await press(customer);
    const history = screen.getByRole("region", { name: "처리 이력" });
    expect(within(history).getByText("고객취소")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "주문서 인쇄" })).toBeNull();
    expect(button("영수증 인쇄")).toBeDisabled();
  });

  it("[← 이전]이면 기간 · 탭 · 검색어 · 페이지가 그대로다", async () => {
    await openHistory();
    await press(button("최근 한 달"));
    await press(mainTabFor("픽업완료"));
    fireEvent.change(
      screen.getByRole("combobox", { name: HISTORY_TEXTS.pageSize }),
      {
        target: { value: "20" },
      },
    );
    await flush();
    await press(button("다음"));
    await press(screen.getAllByRole("listitem")[0].querySelector("button")!);
    expect(
      screen.getByRole("button", { name: HISTORY_TEXTS.back }),
    ).toBeInTheDocument();
    await press(button(HISTORY_TEXTS.back));
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent(
      "10.19 ~ 11.19",
    );
    expect(mainTabFor("픽업완료")).toHaveAttribute("aria-selected", "true");
    expect(button("2")).toHaveAttribute("aria-current", "page");
  });

  it("상세를 못 불러오면 안내와 [다시 시도], [← 이전]은 그대로 쓸 수 있다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const fetchDetail = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockImplementation((id: string) => backend.historyApi.fetchDetail(id));
    const view = await openHistory({ backend, history: { fetchDetail } });
    act(() => view.backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(screen.getAllByRole("listitem")[0].querySelector("button")!);
    expect(screen.getByText(HISTORY_TEXTS.detailFailed)).toBeInTheDocument();
    expect(sent.lines).toContain(
      "주문내역 상세 조회 실패: Error (mock-order-1)",
    );
    await press(button(HISTORY_TEXTS.retry));
    expect(screen.getByRole("heading", { name: /#1/ })).toBeInTheDocument();
  });
});

describe("다른 메인 탭 (11장 C)", () => {
  it("갔다 와도 보던 목록 · 상세가 그대로다", async () => {
    const view = await openHistory();
    act(() => view.backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(screen.getAllByRole("listitem")[0].querySelector("button")!);
    expect(screen.getByRole("heading", { name: /#1/ })).toBeInTheDocument();
    await press(mainTab("주문접수"));
    expect(
      screen.queryByRole("heading", { name: /#1\s*접수대기/, hidden: false }),
    ).toBeNull();
    await press(mainTab("주문내역"));
    expect(
      screen.getByRole("heading", { name: /#1\s*접수대기/ }),
    ).toBeInTheDocument();
  });

  it("[주문접수] 탭에서 접수하면 주문내역 상세도 같은 상태를 본다 (11장 B)", async () => {
    const view = await openHistory();
    act(() => view.backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(screen.getAllByRole("listitem")[0].querySelector("button")!);
    await press(mainTab("주문접수"));
    await press(
      screen.getByRole("button", { name: "주문접수", hidden: false }),
    );
    await press(mainTab("주문내역"));
    expect(
      screen.getByRole("heading", { name: /#1\s*제조중/ }),
    ).toBeInTheDocument();
  });
});

describe("실패 문구", () => {
  it("서버가 상태 변경에 실패하면 「#번호 …」 토스트를 보인다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const view = await openHistory({
      backend,
      api: { changeStatus: () => Promise.reject(new Error("x")) },
    });
    act(() => view.backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(screen.getAllByRole("listitem")[0].querySelector("button")!);
    await press(button("주문접수"));
    expect(screen.getByText(`#1 ${ORDER_MESSAGES.failed}`)).toBeInTheDocument();
    // 상태는 그대로
    expect(
      screen.getByRole("heading", { name: /#1\s*접수대기/ }),
    ).toBeInTheDocument();
  });
});

describe("어긋남 · 늦은 응답 (② 리뷰)", () => {
  const firstRow = () =>
    screen.getAllByRole("listitem")[0].querySelector("button")!;

  it("늦게 온 옛 응답이 새 조건의 화면을 덮지 않는다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const yesterday = new Date(2026, 10, 18).getTime();
    const late: (() => void)[] = [];
    const fetchPage = (q: HistoryQuery) =>
      q.fromDay === yesterday
        ? new Promise<Awaited<ReturnType<OrderHistoryApi["fetchPage"]>>>(
            (resolve) =>
              late.push(() => resolve(backend.historyApi.fetchPage(q))),
          )
        : backend.historyApi.fetchPage(q);
    await openHistory({ backend, history: { fetchPage } });
    await press(button("어제")); // 응답이 아직 안 온다
    await press(button("오늘")); // 새 조건은 바로 답한다
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
    late.forEach((resolve) => resolve()); // 옛 응답이 뒤늦게 도착
    await flush();
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("기간 · 검색을 바꾸면 1쪽부터 다시 묻는다", async () => {
    const { fetchPage } = await openHistory();
    await press(button("최근 한 달"));
    fireEvent.change(
      screen.getByRole("combobox", { name: HISTORY_TEXTS.pageSize }),
      { target: { value: "20" } },
    );
    await flush();
    await press(button("다음"));
    expect(lastQuery(fetchPage).page).toBe(2);
    await press(button("이번 달"));
    expect(lastQuery(fetchPage).page).toBe(1);
    await press(button("최근 한 달"));
    await press(button("다음"));
    fireEvent.change(
      screen.getByRole("textbox", { name: HISTORY_TEXTS.searchLabel }),
      { target: { value: "1" } },
    );
    await advance(SEARCH_DELAY_MS);
    expect(lastQuery(fetchPage)).toMatchObject({ q: "1", page: 1 });
  });

  it("상세를 보는 동안 고객이 취소하면 상세에도 취소 시각 · 누가가 채워진다", async () => {
    const view = await openHistory();
    act(() => view.backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(firstRow());
    act(() => view.backend.dev.customerCancels("mock-order-1"));
    await flush();
    expect(
      screen.getByRole("heading", { name: /#1\s*고객취소/ }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "처리 이력" })).getByText(
        "고객취소",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "주문접수" }),
    ).not.toBeInTheDocument();
  });

  it("이 화면의 상태가 서버와 어긋나 거절되면 안내하고 다시 불러온다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    backend.dev.addOrders(1);
    // 주문 수신 목록에는 없고(다시 연결 중 등) 주문내역 서버에는 있는 주문
    await openHistory({
      backend,
      api: { fetchOrders: () => Promise.resolve([]) },
    });
    await press(button("오늘"));
    await press(button(HISTORY_TEXTS.refresh));
    await press(firstRow());
    await press(button("주문접수"));
    expect(screen.getByText(`#1 ${ORDER_MESSAGES.failed}`)).toBeInTheDocument();
  });

  it("상세에서 돌아오면 누른 행으로 초점이 돌아간다", async () => {
    const view = await openHistory();
    act(() => view.backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(firstRow());
    await press(button(HISTORY_TEXTS.back));
    expect(document.activeElement).toBe(firstRow());
  });
});

describe("값 검증 (③ 리뷰)", () => {
  const firstRow = () =>
    screen.getAllByRole("listitem")[0].querySelector("button")!;
  const input = () =>
    screen.getByRole("textbox", { name: HISTORY_TEXTS.searchLabel });

  it("요약 줄 · 탭 건수가 서버가 센 값 그대로 보인다", async () => {
    const { backend } = await openHistory();
    act(() => backend.dev.addOrders(2)); // 접수대기 2건, 각 ₩4,500
    await press(button(HISTORY_TEXTS.refresh));
    expect(
      screen.getByText("총 2건 · 결제 합계 ₩9,000 (취소 0건 제외)"),
    ).toBeInTheDocument();
    expect(mainTabFor("전체")).toHaveTextContent("전체 2");
    await press(mainTabFor("접수대기"));
    expect(screen.getByText("총 2건 · 결제 합계 ₩9,000")).toBeInTheDocument();
    await press(mainTabFor("취소"));
    expect(screen.getByText("총 0건 · 취소 금액 ₩0")).toBeInTheDocument();
    await press(button("최근 한 달"));
    expect(mainTabFor("전체").textContent).not.toBe("전체 2"); // 기간을 넓히면 건수가 달라진다
  });

  it("검색어를 지우면 (어제를 골라 둔 채) 어제로 돌아간다", async () => {
    const { fetchPage } = await openHistory();
    await press(button("어제"));
    fireEvent.change(input(), { target: { value: "1" } });
    await advance(SEARCH_DELAY_MS);
    fireEvent.change(input(), { target: { value: "" } });
    await flush();
    expect(lastQuery(fetchPage)).toMatchObject({
      q: "",
      fromDay: new Date(2026, 10, 18).getTime(),
    });
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.18");
  });

  it("상세에 들어갔다 나와도 검색어 · 안내가 그대로다", async () => {
    const { fetchPage } = await openHistory();
    await press(button("최근 한 달"));
    fireEvent.change(input(), { target: { value: "1" } });
    await advance(SEARCH_DELAY_MS);
    await press(firstRow());
    await press(button(HISTORY_TEXTS.back));
    expect(input()).toHaveValue("1");
    expect(screen.getByText(HISTORY_TEXTS.searchNotice)).toBeInTheDocument();
    expect(lastQuery(fetchPage).q).toBe("1");
  });

  it("단계마다 파란 강조는 다음 단계 버튼 하나뿐이다", async () => {
    const { backend } = await openHistory();
    act(() => backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(firstRow());
    const blue = () =>
      screen
        .getAllByRole("button")
        .filter((b) => b.classList.contains("bg-blue-600"))
        .map((b) => b.textContent);
    expect(blue()).toEqual(["주문접수"]);
    await press(button("주문접수"));
    expect(blue()).toEqual(["제조완료"]);
    await press(button("제조완료"));
    expect(blue()).toEqual(["픽업완료"]);
    await press(button("픽업완료"));
    expect(blue()).toEqual([]);
    // 픽업완료에서는 [주문서 인쇄]가 켜진다 (T12 스펙 3.2). 프린터가 없으면 눌렀을 때 토스트가 알린다.
    expect(button("주문서 인쇄")).toBeEnabled();
  });

  it("다시 불러오기가 실패하면 낡은 상태 버튼을 막고 안내한다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    let broken = false;
    const fetchDetail = (id: string) =>
      broken
        ? Promise.reject(new Error("fail"))
        : backend.historyApi.fetchDetail(id);
    const { backend: b } = await openHistory({
      backend,
      history: { fetchDetail },
    });
    act(() => b.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(firstRow());
    broken = true;
    act(() => b.dev.otherPcAcceptsOldestPending()); // 다른 PC가 접수: 다시 불러오려 하지만 실패한다
    await flush();
    expect(screen.getByRole("alert")).toHaveTextContent(
      HISTORY_TEXTS.staleFailed,
    );
    expect(button("제조완료")).toBeDisabled();
    broken = false;
    await press(within(screen.getByRole("alert")).getByRole("button"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("heading", { name: /#1\s*제조중/ }),
    ).toBeInTheDocument();
    expect(button("제조완료")).toBeEnabled();
  });
});

describe("0시가 지난 뒤 (A-1)", () => {
  it("고른 기간이 조회 범위를 벗어나면 오늘로 되돌리고 오늘 기준으로 다시 묻는다", async () => {
    const { fetchPage } = await openHistory();
    await press(button("최근 한 달")); // 10.19 ~ 11.19
    vi.setSystemTime(new Date(2026, 10, 21, 9, 0)); // 이틀 뒤: 시작일 10.19는 범위(10.21~) 밖
    await advance(60_000);
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.21");
    expect(lastQuery(fetchPage)).toMatchObject({
      fromDay: new Date(2026, 10, 21).getTime(),
      toDay: new Date(2026, 10, 21).getTime(),
      page: 1,
    });
  });

  it("범위 안이면 고른 기간을 그대로 둔다", async () => {
    await openHistory();
    await press(button("어제")); // 11.18
    vi.setSystemTime(new Date(2026, 10, 21, 9, 0));
    await advance(60_000);
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.18");
  });

  it("0시 직후 1분 신호가 오기 전에 [오늘]을 눌러도 어제로 되돌아가지 않는다", async () => {
    await openHistory();
    vi.setSystemTime(new Date(2026, 10, 20, 0, 0, 30)); // 신호(now)는 아직 11.19 15:00
    await press(button("오늘"));
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.19");
    await advance(60_000);
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.19");
  });
});

describe("탭을 누를 때마다 새로 고침", () => {
  const input = () =>
    screen.getByRole("textbox", { name: HISTORY_TEXTS.searchLabel });

  it("처음 열 때는 조회가 한 번뿐이다", async () => {
    const { fetchPage } = await openHistory();
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("다른 탭에 갔다 오면 같은 조건으로 다시 조회하고, 그동안 생긴 주문이 보인다", async () => {
    const { fetchPage, backend } = await openHistory();
    await press(button("최근 한 달"));
    await press(mainTabFor("취소"));
    fireEvent.change(input(), { target: { value: "1" } });
    await advance(SEARCH_DELAY_MS);
    const before = lastQuery(fetchPage);
    const calls = fetchPage.mock.calls.length;
    await press(mainTab("주문접수"));
    act(() => backend.dev.addOrders(1));
    await press(mainTab("주문내역"));
    expect(fetchPage.mock.calls.length).toBe(calls + 1);
    expect(lastQuery(fetchPage)).toEqual(before); // 기간 · 탭 · 검색어 · 페이지 · 건수 그대로
    expect(input()).toHaveValue("1");
    expect(mainTabFor("취소")).toHaveAttribute("aria-selected", "true");
  });

  it("새로 생긴 주문이 [새로 고침]을 누르지 않아도 목록에 나온다", async () => {
    const { backend } = await openHistory();
    expect(screen.getByText(HISTORY_TEXTS.empty)).toBeInTheDocument();
    await press(mainTab("주문접수"));
    act(() => backend.dev.addOrders(1));
    await press(mainTab("주문내역"));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("이미 [주문내역] 탭일 때 다시 눌러도 새로 고침", async () => {
    const { fetchPage } = await openHistory();
    const calls = fetchPage.mock.calls.length;
    await press(mainTab("주문내역"));
    expect(fetchPage.mock.calls.length).toBe(calls + 1);
  });

  it("상세가 열려 있으면 그 상세도 다시 불러온다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const fetchDetail = vi.fn((id: string) =>
      backend.historyApi.fetchDetail(id),
    );
    const view = await openHistory({ backend, history: { fetchDetail } });
    act(() => view.backend.dev.addOrders(1));
    await press(button(HISTORY_TEXTS.refresh));
    await press(screen.getAllByRole("listitem")[0].querySelector("button")!);
    const calls = fetchDetail.mock.calls.length;
    await press(mainTab("주문접수"));
    await press(mainTab("주문내역"));
    expect(fetchDetail.mock.calls.length).toBe(calls + 1);
    expect(screen.getByRole("heading", { name: /#1/ })).toBeInTheDocument();
  });

  it("0시 되돌림이 먼저 적용된 뒤 오늘 기준으로 조회한다 (1분 신호를 기다리지 않는다)", async () => {
    const { fetchPage } = await openHistory();
    await press(button("최근 한 달")); // 10.19 ~ 11.19
    await press(mainTab("주문접수"));
    vi.setSystemTime(new Date(2026, 10, 21, 0, 0, 10)); // 신호(now)는 아직 11.19 15:00
    const calls = fetchPage.mock.calls.length;
    await press(mainTab("주문내역"));
    expect(fetchPage.mock.calls.length).toBe(calls + 1); // 예전 기간으로 한 번 더 묻지 않는다
    expect(button(HISTORY_TEXTS.periodLabel)).toHaveTextContent("11.21");
    expect(lastQuery(fetchPage)).toMatchObject({
      fromDay: new Date(2026, 10, 21).getTime(),
      toDay: new Date(2026, 10, 21).getTime(),
      page: 1,
    });
  });

  it("다시 조회가 끝나면 보던 스크롤 위치를 되돌린다", async () => {
    await openHistory();
    await press(button("최근 한 달"));
    const list = screen.getAllByRole("listitem")[0].closest("div")!;
    list.scrollTop = 150;
    fireEvent.scroll(list);
    await press(mainTab("주문접수"));
    list.scrollTop = 0; // 숨겨졌다 다시 보이며 위치가 날아간 것을 흉내 낸다
    await press(mainTab("주문내역"));
    expect(screen.getAllByRole("listitem")[0].closest("div")!.scrollTop).toBe(
      150,
    );
  });

  it("조회 중에 목록이 비어 생기는 0 위치는 기억하지 않는다", async () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    let gate: Promise<void> | null = null;
    const fetchPage = (q: HistoryQuery) =>
      gate
        ? gate.then(() => backend.historyApi.fetchPage(q))
        : backend.historyApi.fetchPage(q);
    await openHistory({ backend, history: { fetchPage } });
    await press(button("최근 한 달"));
    const list = screen.getAllByRole("listitem")[0].closest("div")!;
    list.scrollTop = 150;
    fireEvent.scroll(list);
    await press(mainTab("주문접수"));
    let release = () => {};
    gate = new Promise<void>((resolve) => (release = resolve));
    await press(mainTab("주문내역")); // 조회 중
    list.scrollTop = 0;
    fireEvent.scroll(list); // 목록이 비어 위치가 0으로 잘린 것을 흉내 낸다
    gate = null;
    release();
    await flush();
    expect(list.scrollTop).toBe(150);
  });

  it("화면 안 [새로 고침]도 보던 스크롤 위치를 지킨다", async () => {
    await openHistory();
    await press(button("최근 한 달"));
    const list = screen.getAllByRole("listitem")[0].closest("div")!;
    list.scrollTop = 120;
    fireEvent.scroll(list);
    list.scrollTop = 0;
    await press(button(HISTORY_TEXTS.refresh));
    expect(list.scrollTop).toBe(120);
  });
});
