// 출력 연결 (T12 스펙 3 · 4 · 5장 · 9장): 자동 출력 · 수동 출력 · 다시 인쇄 · 실패 처리 · 영수증.
import { act, render } from "@testing-library/react";
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
import {
  toHistoryOrder,
  type ReceiptStore,
} from "../../shared/api/order-history";
import type { Order } from "../../shared/api/orders";
import { createMockOrderBackend } from "../../shared/api/orders";
import { createFakeLogApi } from "../../shared/log/log-api";
import {
  OrdersContext,
  type OrdersContextValue,
} from "../../shared/orders/orders-context";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
  type PrinterApi,
} from "../../shared/printer/printer-api";
import type { PrintDocument } from "../../shared/printer/print-lines";
import type {
  PrinterSettings,
  PrinterSlot,
} from "../../shared/printer/printer-settings";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import { createFakeWindow } from "../../test/fakes";
import { AppShellProvider } from "../app-shell/AppShellContext";
import { usePrintForms, type PrintFormsValue } from "./print-forms-context";
import { PrintFormsProvider } from "./PrintFormsProvider";
import { PRINT_TIMEOUT_MS } from "./print-timeout";

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
const RECEIPT_STORE: ReceiptStore = {
  name: "시험점",
  phone: "02-000-0000",
  address: "서울",
  representative: "김",
  businessNumber: "000-00-00000",
};
const ORDER: Order = {
  orderId: "o-108",
  orderNumber: "2611190000010108",
  pickupNumber: 108,
  status: "preparing",
  updatedAt: 1,
  paidAt: new Date(2026, 10, 19, 9, 30).getTime(),
  pickupChoice: "now",
  items: [{ name: "아메리카노", quantity: 1, options: ["샷 추가"] }],
  note: "얼음 적게",
  customerName: "박*준",
  phoneLast4: "1234",
  statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
};

const slot = (name: string, patch: Partial<PrinterSlot> = {}): PrinterSlot => ({
  printerName: name,
  purpose: "",
  printOrder: true,
  printReceipt: false,
  paperWidth: 80,
  ...patch,
});
const settings = (...slots: (PrinterSlot | null)[]): PrinterSettings => ({
  version: 1,
  slots: [slots[0] ?? null, slots[1] ?? null, slots[2] ?? null],
});

function setup(
  initial: PrinterSettings,
  print: (name: string, doc: PrintDocument) => Promise<void> = async () => {},
) {
  const printed: { printerName: string; doc: PrintDocument }[] = [];
  const printDocument = vi.fn(
    async (printerName: string, doc: PrintDocument) => {
      printed.push({ printerName, doc });
      await print(printerName, doc);
    },
  );
  const printerApi: PrinterApi = { ...createFakePrinterApi(), printDocument };
  const store = createMemoryPrinterSettingsStore(initial);
  const sound = { playNewOrder: vi.fn(), playWarning: vi.fn() };
  let accept: (order: Order) => void = () => {};
  const makeOrders = (list: Order[]) =>
    ({
      sound,
      orders: list,
      onAccepted: (listener: (order: Order) => void) => {
        accept = listener;
        return () => {};
      },
    }) as unknown as OrdersContextValue;
  const backend = createMockOrderBackend({ delayMs: 0 });
  const probe: { value: PrintFormsValue | null } = { value: null };
  function Probe() {
    probe.value = usePrintForms();
    return null;
  }
  const ui = (list: Order[]) => (
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={backend.storeStatusApi}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={createMemoryTokenStore()}
      printerApi={printerApi}
      printerSettingsStore={store}
      logApi={createFakeLogApi()}
      initialSession={STORE}
    >
      <OrdersContext.Provider value={makeOrders(list)}>
        <PrintFormsProvider>
          <Probe />
        </PrintFormsProvider>
      </OrdersContext.Provider>
    </AppShellProvider>
  );
  const view = render(ui([]));
  const value = () => probe.value as PrintFormsValue;
  return {
    printed,
    sound,
    value,
    accept: (order: Order = ORDER) =>
      act(async () => {
        accept(order);
      }),
    store,
    /** 주문 목록이 바뀐 것처럼 다시 그린다 (취소 감지용). */
    setOrders: (list: Order[]) =>
      act(async () => {
        view.rerender(ui(list));
      }),
  };
}

const texts = (doc: PrintDocument) => doc.lines.map((l) => l.text ?? "");
const failOn =
  (...names: string[]) =>
  async (name: string) => {
    if (names.includes(name)) throw "프린터를 찾을 수 없음";
  };

beforeEach(() => vi.clearAllMocks());

describe("자동 출력", () => {
  it("접수되면 「주문서」 체크된 슬롯마다 한 장씩 낸다 (재출력 표시 없음)", async () => {
    const t = setup(
      settings(
        slot("A"),
        slot("B", { paperWidth: 58 }),
        slot("C", { printOrder: false, printReceipt: true }),
      ),
    );
    await t.accept();
    expect(t.printed.map((p) => p.printerName)).toEqual(["A", "B"]);
    expect(t.printed.map((p) => p.doc.paperWidth)).toEqual([80, 58]);
    expect(texts(t.printed[0].doc)[0]).not.toContain("재출력");
    expect(t.value().failures).toEqual([]);
  });

  it("접수 신호 한 번에 한 번만 낸다", async () => {
    const t = setup(settings(slot("A")));
    await t.accept();
    expect(t.printed).toHaveLength(1);
  });

  it("체크된 슬롯이 없으면 조용히 건너뛴다", async () => {
    const t = setup(settings(slot("A", { printOrder: false })));
    await t.accept();
    expect(t.printed).toEqual([]);
    expect(t.sound.playWarning).not.toHaveBeenCalled();
    expect(t.value().failures).toEqual([]);
  });
});

describe("30초 안에 끝나지 않으면 결과를 확인할 수 없음 (Q47)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("실패와 같게 알리되 슬롯 · 프린터 이름만 적고, 뒤늦은 결과는 무시한다", async () => {
    let finishLate = () => {};
    const t = setup(
      settings(slot("SEWOO")),
      () => new Promise<void>((resolve) => (finishLate = resolve)),
    );
    await t.accept();
    expect(t.value().failures).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS);
    });
    const [failure] = t.value().failures;
    expect(failure.slots[0]).toMatchObject({
      index: 0,
      printerName: "SEWOO",
      unknownResult: true,
    });
    expect(t.sound.playWarning).toHaveBeenCalledTimes(1);
    expect(t.value().unprinted.has("o-108")).toBe(true);
    // 뒤늦게 Rust 쪽 출력이 끝나도 띠 · 꼬리표는 그대로다.
    await act(async () => {
      finishLate();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(t.value().failures).toHaveLength(1);
    expect(t.sound.playWarning).toHaveBeenCalledTimes(1);
  });

  it("30초 전에 끝나면 평소처럼 성공이다", async () => {
    const t = setup(
      settings(slot("A")),
      () => new Promise<void>((resolve) => setTimeout(resolve, 29_000)),
    );
    await t.accept();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(t.value().failures).toEqual([]);
    expect(t.sound.playWarning).not.toHaveBeenCalled();
  });

  it("영수증은 팝업 안 문구로 같은 뜻을 알린다", async () => {
    const t = setup(
      settings(slot("SEWOO", { printOrder: false, printReceipt: true })),
      () => new Promise<void>(() => {}),
    );
    let result: unknown;
    await act(async () => {
      const pending = t
        .value()
        .printReceipt(toHistoryOrder(ORDER, null, []), RECEIPT_STORE)
        .then((r) => (result = r));
      await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS);
      await pending;
    });
    expect(result).toEqual({
      ok: false,
      message: "영수증 출력 결과를 확인할 수 없습니다. (슬롯 1 SEWOO)",
    });
    expect(t.sound.playWarning).not.toHaveBeenCalled();
  });
});

describe("취소된 주문의 미출력 기록 (사용자 결정 2026-11-19)", () => {
  it.each(["store-cancelled", "customer-cancelled"] as const)(
    "미출력 주문이 %s로 바뀌면 띠와 꼬리표를 자동으로 지운다",
    async (status) => {
      const t = setup(settings(slot("A")), failOn("A"));
      await t.accept();
      expect(t.value().unprinted.has("o-108")).toBe(true);
      await t.setOrders([{ ...ORDER, status: "preparing" }]);
      expect(t.value().unprinted.has("o-108")).toBe(true);
      await t.setOrders([{ ...ORDER, status }]);
      expect(t.value().failures).toEqual([]);
      expect(t.value().unprinted.size).toBe(0);
    },
  );
});

describe("출력 실패", () => {
  it("경고음 한 번 · 띠 정보 · 미출력, 실패한 슬롯만 적는다", async () => {
    const t = setup(settings(slot("A"), slot("B")), failOn("B", "A"));
    await t.accept();
    expect(t.sound.playWarning).toHaveBeenCalledTimes(1);
    const [failure] = t.value().failures;
    expect(failure.pickupNumber).toBe(108);
    expect(failure.slots.map((s) => s.index)).toEqual([0, 1]);
    expect(failure.slots[0].reason).toBe("프린터를 찾을 수 없음");
    expect(t.value().unprinted.has("o-108")).toBe(true);
  });

  it("[다시 인쇄]는 실패한 슬롯에만 낸다, 성공하면 띠 · 꼬리표를 지운다", async () => {
    let broken = true;
    const t = setup(settings(slot("A"), slot("B")), async (name) => {
      if (name === "B" && broken) throw "인쇄를 시작하지 못함";
    });
    await t.accept();
    expect(t.value().failures[0].slots.map((s) => s.index)).toEqual([1]);
    t.printed.length = 0;
    broken = false;
    await act(async () => t.value().retry("o-108"));
    expect(t.printed.map((p) => p.printerName)).toEqual(["B"]);
    // 첫 출력과 같으므로 「[재출력]」을 찍지 않는다.
    expect(texts(t.printed[0].doc)[0]).not.toContain("재출력");
    expect(t.value().failures).toEqual([]);
    expect(t.value().unprinted.size).toBe(0);
  });

  it("다시 인쇄도 실패하면 띠를 바꾸고 경고음을 다시 낸다", async () => {
    let reason: string = "프린터를 찾을 수 없음";
    const t = setup(settings(slot("A")), async () => {
      throw reason;
    });
    await t.accept();
    reason = "인쇄를 마치지 못함";
    await act(async () => t.value().retry("o-108"));
    expect(t.value().failures[0].slots[0].reason).toBe("인쇄를 마치지 못함");
    expect(t.sound.playWarning).toHaveBeenCalledTimes(2);
    expect(t.value().failures).toHaveLength(1);
  });

  it("알 수 없는 오류는 고정 문구로 바꾼다 (입력값이 섞이지 않게)", async () => {
    const t = setup(settings(slot("A")), async () => {
      throw new Error("C:\\사용자\\박*준 secret");
    });
    await t.accept();
    expect(t.value().failures[0].slots[0].reason).toBe("알 수 없는 오류");
  });

  it("설정을 못 읽으면 이유를 띠에 남기고, 알던 실패 슬롯은 덮어쓰지 않는다", async () => {
    const t = setup(settings(slot("A"), slot("B")), failOn("B"));
    await t.accept();
    expect(t.value().failures[0].slots.map((s) => s.index)).toEqual([1]);
    t.printed.length = 0;
    const load = vi
      .spyOn(t.store, "load")
      .mockRejectedValueOnce(new Error("x"));
    await act(async () => t.value().retry("o-108"));
    load.mockRestore();
    expect(t.printed).toEqual([]);
    const [failure] = t.value().failures;
    expect(failure.extraReason).toBe("프린터 설정을 읽지 못함");
    expect(failure.slots.map((s) => s.index)).toEqual([1]);
    // 설정이 다시 읽히면 실패한 슬롯(B)에만 낸다. 이미 성공한 A에는 다시 내지 않는다.
    await act(async () => t.value().retry("o-108"));
    expect(t.printed.map((p) => p.printerName)).toEqual(["B"]);
  });

  it("처음부터 설정을 못 읽었으면 다시 인쇄는 체크된 모든 슬롯에 낸다", async () => {
    const t = setup(settings(slot("A"), slot("B")));
    vi.spyOn(t.store, "load").mockRejectedValueOnce(new Error("x"));
    await t.accept();
    expect(t.printed).toEqual([]);
    expect(t.value().failures[0]).toMatchObject({
      slots: [],
      extraReason: "프린터 설정을 읽지 못함",
    });
    await act(async () => t.value().retry("o-108"));
    expect(t.printed.map((p) => p.printerName)).toEqual(["A", "B"]);
    expect(t.value().failures).toEqual([]);
  });

  it("[×]는 띠만 닫고 「미출력」은 남긴다: 이어서 [주문서 인쇄]는 실패한 슬롯에만 낸다 (스펙 5장)", async () => {
    let broken = true;
    const t = setup(settings(slot("A"), slot("B")), async (name) => {
      if (name === "B" && broken) throw "프린터를 찾을 수 없음";
    });
    await t.accept();
    act(() => t.value().dismiss("o-108"));
    expect(t.value().failures).toEqual([]);
    expect(t.value().unprinted.has("o-108")).toBe(true);
    t.printed.length = 0;
    broken = false;
    await act(async () => {
      await t.value().printOrder(ORDER);
    });
    expect(t.printed.map((p) => p.printerName)).toEqual(["B"]);
    expect(texts(t.printed[0].doc)[0]).not.toContain("재출력");
    expect(t.value().unprinted.size).toBe(0);
  });

  it("실패한 슬롯이 설정에서 없어지면 no-printer, 미출력 기록은 지우지 않는다", async () => {
    const t = setup(settings(slot("A")), failOn("A"));
    await t.accept();
    await act(async () => t.store.save(settings()));
    let result = "";
    await act(async () => {
      result = await t.value().printOrder(ORDER);
    });
    expect(result).toBe("no-printer");
    expect(t.value().unprinted.has("o-108")).toBe(true);
    expect(t.value().failures[0].extraReason).toBe("출력할 프린터가 없음");
  });

  it("수동 재출력이 실패해도 다시 인쇄에는 「[재출력]」을 찍지 않는다", async () => {
    let broken = true;
    const t = setup(settings(slot("A")), async () => {
      if (broken) throw "프린터를 찾을 수 없음";
    });
    await act(async () => {
      await t.value().printOrder(ORDER);
    });
    expect(texts(t.printed[0].doc)[0]).toMatch(/^\[재출력\]/);
    broken = false;
    t.printed.length = 0;
    await act(async () => t.value().retry("o-108"));
    expect(texts(t.printed[0].doc)[0]).not.toContain("재출력");
  });

  it("접수는 그대로: 실패해도 예외를 밖으로 던지지 않는다", async () => {
    const t = setup(settings(slot("A")), failOn("A"));
    await expect(t.accept()).resolves.not.toThrow();
  });
});

describe("[주문서 인쇄]", () => {
  it("같은 주문을 보내는 중이면 겹쳐 내지 않고 busy를 돌려준다", async () => {
    let finish = () => {};
    const t = setup(
      settings(slot("A")),
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    let first: Promise<string> | undefined;
    let second = "";
    await act(async () => {
      first = t.value().printOrder(ORDER);
      await Promise.resolve();
    });
    await act(async () => {
      second = await t.value().printOrder(ORDER);
    });
    expect(second).toBe("busy");
    await act(async () => {
      finish();
      await first;
    });
    expect(t.printed).toHaveLength(1);
  });

  it("이미 출력된 주문은 체크된 슬롯 모두에 「[재출력] HH:mm」과 함께 낸다", async () => {
    const t = setup(settings(slot("A"), slot("B")));
    let result = "";
    await act(async () => {
      result = await t.value().printOrder(ORDER);
    });
    expect(result).toBe("ok");
    expect(t.printed.map((p) => p.printerName)).toEqual(["A", "B"]);
    expect(texts(t.printed[0].doc)[0]).toMatch(/^\[재출력\] \d\d:\d\d$/);
  });

  it("체크된 슬롯이 없으면 no-printer (토스트는 부르는 쪽)", async () => {
    const t = setup(settings(slot("A", { printOrder: false })));
    let result = "";
    await act(async () => {
      result = await t.value().printOrder(ORDER);
    });
    expect(result).toBe("no-printer");
    expect(t.printed).toEqual([]);
    expect(t.sound.playWarning).not.toHaveBeenCalled();
  });

  it("미출력 주문은 실패한 슬롯에만, 「[재출력]」 없이 낸다", async () => {
    let broken = true;
    const t = setup(settings(slot("A"), slot("B")), async (name) => {
      if (name === "A" && broken) throw "프린터를 찾을 수 없음";
    });
    await t.accept();
    t.printed.length = 0;
    broken = false;
    await act(async () => {
      await t.value().printOrder(ORDER);
    });
    expect(t.printed.map((p) => p.printerName)).toEqual(["A"]);
    expect(texts(t.printed[0].doc)[0]).not.toContain("재출력");
    expect(t.value().failures).toEqual([]);
  });

  it("수동 출력이 실패해도 경고음 · 띠 · 미출력으로 알린다", async () => {
    const t = setup(settings(slot("A")), failOn("A"));
    let result = "";
    await act(async () => {
      result = await t.value().printOrder(ORDER);
    });
    expect(result).toBe("failed");
    expect(t.sound.playWarning).toHaveBeenCalledTimes(1);
    expect(t.value().unprinted.has("o-108")).toBe(true);
  });
});

describe("영수증", () => {
  const detail = toHistoryOrder(ORDER, null, []);

  it("「영수증」 체크된 슬롯 중 번호가 가장 앞선 한 대로만 낸다", async () => {
    const t = setup(
      settings(
        slot("A", { printOrder: true }),
        slot("B", { printOrder: false, printReceipt: true }),
        slot("C", { printOrder: false, printReceipt: true, paperWidth: 58 }),
      ),
    );
    let result: unknown;
    await act(async () => {
      result = await t.value().printReceipt(detail, RECEIPT_STORE);
    });
    expect(result).toEqual({ ok: true });
    expect(t.printed.map((p) => p.printerName)).toEqual(["B"]);
    expect(texts(t.printed[0].doc)[0]).toBe("영수증");
  });

  it("실패하면 슬롯 · 프린터 · 이유가 든 문구를 돌려주고 경고음 · 띠는 쓰지 않는다", async () => {
    const t = setup(
      settings(slot("SEWOO", { printOrder: false, printReceipt: true })),
      failOn("SEWOO"),
    );
    let result: unknown;
    await act(async () => {
      result = await t.value().printReceipt(detail, RECEIPT_STORE);
    });
    expect(result).toEqual({
      ok: false,
      message:
        "영수증을 출력하지 못했습니다. (슬롯 1 SEWOO: 프린터를 찾을 수 없음)",
    });
    expect(t.sound.playWarning).not.toHaveBeenCalled();
    expect(t.value().failures).toEqual([]);
  });

  it("체크된 슬롯이 없으면 출력하지 않는다", async () => {
    const t = setup(settings(slot("A")));
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await t.value().printReceipt(detail, RECEIPT_STORE);
    });
    expect(result?.ok).toBe(false);
    expect(t.printed).toEqual([]);
  });

  it("refreshReceiptEnabled: 영수증 체크가 있을 때만 켜진다", async () => {
    const t = setup(settings(slot("A")));
    await act(async () => t.value().refreshReceiptEnabled());
    expect(t.value().receiptEnabled).toBe(false);
    await act(async () =>
      t.store.save(settings(slot("A", { printReceipt: true }))),
    );
    await act(async () => t.value().refreshReceiptEnabled());
    expect(t.value().receiptEnabled).toBe(true);
  });
});

describe("재제조 주문서 (T21, print-forms 13장)", () => {
  it("「주문서」 체크된 슬롯 모두에 「[재제조] HH:mm」 · 「사유」와 함께, 「[재출력]」 없이 낸다", async () => {
    const t = setup(
      settings(slot("A"), slot("B"), slot("C", { printOrder: false })),
    );
    let result = "";
    await act(async () => {
      result = await t
        .value()
        .printRemake(ORDER, "맛 · 품질 문제", [{ itemIndex: 0, quantity: 1 }]);
    });
    expect(result).toBe("ok");
    expect(t.printed.map((p) => p.printerName)).toEqual(["A", "B"]);
    const lines = texts(t.printed[0].doc);
    expect(lines[0]).toMatch(/^\[재제조\] \d\d:\d\d$/);
    expect(lines[1]).toBe("사유: 맛 · 품질 문제");
    expect(lines.join("\n")).not.toContain("재출력");
  });

  it("같은 주문을 출력하는 중이면 버리지 않고, 끝난 뒤에 낸다 (리뷰 ②)", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    let finish = () => {};
    let calls = 0;
    const t = setup(settings(slot("A")), () =>
      ++calls === 1
        ? new Promise<void>((resolve) => (finish = resolve))
        : Promise.resolve(),
    );
    let remake: Promise<string> | undefined;
    await act(async () => {
      void t.value().printOrder(ORDER);
      await Promise.resolve();
      remake = t
        .value()
        .printRemake(ORDER, "이물질", [{ itemIndex: 0, quantity: 1 }]);
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(t.printed).toHaveLength(1); // 앞 출력이 끝나기 전에는 내지 않는다
    let result = "";
    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(1000);
      result = await remake!;
    });
    expect(result).toBe("ok");
    expect(t.printed).toHaveLength(2);
    expect(texts(t.printed[1].doc)[1]).toBe("사유: 이물질");
  });

  it("실패하면 주문서 실패 규칙대로 알리고, 다시 인쇄도 재제조 주문서다", async () => {
    const t = setup(settings(slot("A"), slot("B")), failOn("B"));
    await act(async () => {
      await t
        .value()
        .printRemake(ORDER, "이물질", [{ itemIndex: 0, quantity: 1 }]);
    });
    expect(t.sound.playWarning).toHaveBeenCalledTimes(1);
    expect(t.value().unprinted.has(ORDER.orderId)).toBe(true);
    expect(
      texts({ lines: t.value().failures[0].lines } as PrintDocument)[1],
    ).toBe("사유: 이물질");
  });
});
