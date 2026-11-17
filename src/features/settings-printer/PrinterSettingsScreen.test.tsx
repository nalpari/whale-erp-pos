import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
  type PrinterApi,
  type PrinterSettingsStore,
} from "../../shared/printer/printer-api";
import {
  assignPrinter,
  createEmptyPrinterSettings,
  updateSlot,
  type PrinterSettings,
} from "../../shared/printer/printer-settings";
import { PrinterSettingsScreen } from "./PrinterSettingsScreen";

const STORE_NAME = "힘이나는커피생활 종로점";

function settingsWith(...names: string[]): PrinterSettings {
  return names.reduce(
    (s, name, i) => assignPrinter(s, i as 0 | 1 | 2, name),
    createEmptyPrinterSettings(),
  );
}

async function renderScreen(
  options: {
    printerApi?: PrinterApi;
    store?: PrinterSettingsStore;
    canEdit?: boolean;
  } = {},
) {
  const printerApi =
    options.printerApi ?? createFakePrinterApi(["A", "B", "C"]);
  const store = options.store ?? createMemoryPrinterSettingsStore();
  render(
    <PrinterSettingsScreen
      printerApi={printerApi}
      store={store}
      canEdit={options.canEdit ?? true}
      storeName={STORE_NAME}
    />,
  );
  await screen.findByRole("heading", { name: /^슬롯 1/ });
  return { printerApi, store };
}

function slot(n: number) {
  return screen.getByRole("group", { name: new RegExp(`^슬롯 ${n}`) });
}

async function addPrinter(n: number, name: string) {
  fireEvent.click(
    within(slot(n)).getByRole("button", { name: "+ 프린터 추가" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "프린터 선택" });
  fireEvent.click(await within(dialog).findByRole("button", { name }));
}

describe("프린터설정 화면", () => {
  it("빈 칸 3개와 안내 문구 원문을 보인다", async () => {
    await renderScreen();
    for (const n of [1, 2, 3]) {
      expect(
        screen.getByRole("heading", { name: `슬롯 ${n} — 프린터 없음` }),
      ).toBeInTheDocument();
      expect(
        within(slot(n)).getByRole("button", { name: "+ 프린터 추가" }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("프린터 추가 방법")).toBeInTheDocument();
    expect(
      screen.getByText("① 프린터를 USB 또는 네트워크로 PC에 연결합니다"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("② Windows 프린터 드라이버를 설치합니다"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "③ '+ 프린터 추가' 버튼 클릭 → 목록에서 해당 프린터를 선택합니다",
      ),
    ).toBeInTheDocument();
  });

  it("목록에서 골라 등록하면 기본값으로 바로 저장한다", async () => {
    const { store } = await renderScreen();
    await addPrinter(2, "B");
    expect(
      screen.getByRole("heading", { name: "슬롯 2 — B" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      within(slot(2)).getByRole("checkbox", { name: "주문서" }),
    ).toBeChecked();
    expect(
      within(slot(2)).getByRole("checkbox", { name: "영수증 (고객 요청 시)" }),
    ).not.toBeChecked();
    expect(within(slot(2)).getByText("용도 입력")).toBeInTheDocument();
    await waitFor(async () =>
      expect((await store.load()).slots[1]?.printerName).toBe("B"),
    );
  });

  it("다른 칸에 등록된 프린터는 고를 수 없다", async () => {
    await renderScreen({
      store: createMemoryPrinterSettingsStore(settingsWith("A")),
    });
    fireEvent.click(
      within(slot(2)).getByRole("button", { name: "+ 프린터 추가" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "프린터 선택" });
    expect(
      await within(dialog).findByRole("button", { name: "B" }),
    ).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: /^A/ })).toBeDisabled();
  });

  it("팝업의 [취소]는 아무것도 바꾸지 않는다", async () => {
    await renderScreen();
    fireEvent.click(
      within(slot(1)).getByRole("button", { name: "+ 프린터 추가" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "프린터 선택" });
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "슬롯 1 — 프린터 없음" }),
    ).toBeInTheDocument();
  });

  it("설치된 프린터가 없으면 안내한다", async () => {
    await renderScreen({ printerApi: createFakePrinterApi([]) });
    fireEvent.click(
      within(slot(1)).getByRole("button", { name: "+ 프린터 추가" }),
    );
    expect(
      await screen.findByText("설치된 프린터가 없습니다."),
    ).toBeInTheDocument();
  });

  it("목록을 못 읽으면 오류 문구를 보인다", async () => {
    const printerApi: PrinterApi = {
      listPrinters: vi.fn().mockRejectedValue(new Error("spooler")),
      printTestPage: vi.fn(),
    };
    await renderScreen({ printerApi });
    fireEvent.click(
      within(slot(1)).getByRole("button", { name: "+ 프린터 추가" }),
    );
    expect(
      await screen.findByText("프린터 목록을 불러올 수 없습니다."),
    ).toBeInTheDocument();
  });

  it("[연결 해제]는 확인 없이 바로 칸을 비운다", async () => {
    const store = createMemoryPrinterSettingsStore(settingsWith("A"));
    await renderScreen({ store });
    fireEvent.click(within(slot(1)).getByRole("button", { name: "연결 해제" }));
    expect(
      screen.getByRole("heading", { name: "슬롯 1 — 프린터 없음" }),
    ).toBeInTheDocument();
    await waitFor(async () => expect((await store.load()).slots[0]).toBeNull());
  });

  it("출력 항목 체크를 바꾸면 저장한다", async () => {
    const store = createMemoryPrinterSettingsStore(settingsWith("A"));
    await renderScreen({ store });
    fireEvent.click(
      within(slot(1)).getByRole("checkbox", { name: "영수증 (고객 요청 시)" }),
    );
    fireEvent.click(within(slot(1)).getByRole("checkbox", { name: "주문서" }));
    await waitFor(async () =>
      expect((await store.load()).slots[0]).toMatchObject({
        printOrder: false,
        printReceipt: true,
      }),
    );
  });

  describe("용도 이름 고치기", () => {
    async function startEdit() {
      const store = createMemoryPrinterSettingsStore(settingsWith("A"));
      await renderScreen({ store });
      fireEvent.click(
        within(slot(1)).getByRole("button", { name: "용도 이름 고치기" }),
      );
      const input = within(slot(1)).getByRole("textbox", { name: "용도 이름" });
      fireEvent.change(input, { target: { value: "카운터 영수증" } });
      return { store, input };
    }

    it("Enter로 저장한다", async () => {
      const { store, input } = await startEdit();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(within(slot(1)).getByText("카운터 영수증")).toBeInTheDocument();
      await waitFor(async () =>
        expect((await store.load()).slots[0]?.purpose).toBe("카운터 영수증"),
      );
    });

    it("칸 밖을 누르면 저장한다", async () => {
      const { store, input } = await startEdit();
      fireEvent.blur(input);
      await waitFor(async () =>
        expect((await store.load()).slots[0]?.purpose).toBe("카운터 영수증"),
      );
    });

    it("한글 조합 중 Enter로는 저장하지 않는다", async () => {
      const { store, input } = await startEdit();
      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      expect(
        within(slot(1)).getByRole("textbox", { name: "용도 이름" }),
      ).toBeInTheDocument();
      expect((await store.load()).slots[0]?.purpose).toBe("");
    });

    it("Esc면 취소한다", async () => {
      const { store, input } = await startEdit();
      fireEvent.keyDown(input, { key: "Escape" });
      expect(
        within(slot(1)).queryByRole("textbox", { name: "용도 이름" }),
      ).not.toBeInTheDocument();
      expect(within(slot(1)).getByText("용도 입력")).toBeInTheDocument();
      expect((await store.load()).slots[0]?.purpose).toBe("");
    });
  });

  it("저장에 실패하면 화면을 되돌리고 문구를 보인다", async () => {
    const store: PrinterSettingsStore = {
      load: async () => settingsWith("A"),
      save: vi.fn().mockRejectedValue(new Error("disk")),
    };
    await renderScreen({ store });
    fireEvent.click(within(slot(1)).getByRole("button", { name: "연결 해제" }));
    expect(
      await screen.findByText("설정을 저장하지 못했습니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "슬롯 1 — A" }),
    ).toBeInTheDocument();
  });

  it("연달아 바꾸다 앞 저장은 성공하고 뒤 저장이 실패하면 앞 저장 값으로 되돌린다", async () => {
    const pending: { resolve(): void; reject(e: Error): void }[] = [];
    const store: PrinterSettingsStore = {
      load: async () => settingsWith("A", "B"),
      save: () =>
        new Promise<void>((resolve, reject) =>
          pending.push({ resolve, reject }),
        ),
    };
    await renderScreen({ store });
    fireEvent.click(within(slot(1)).getByRole("button", { name: "연결 해제" }));
    fireEvent.click(within(slot(2)).getByRole("button", { name: "연결 해제" }));
    await act(async () => pending[0].resolve());
    await act(async () => pending[1].reject(new Error("disk")));
    expect(screen.getByText("설정을 저장하지 못했습니다.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "슬롯 1 — 프린터 없음" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "슬롯 2 — B" }),
    ).toBeInTheDocument();
  });

  it("앞 저장이 늦게 실패해도 그 뒤에 바꾼 값을 되돌리지 않는다", async () => {
    const pending: { resolve(): void; reject(e: Error): void }[] = [];
    const store: PrinterSettingsStore = {
      load: async () => settingsWith("A", "B"),
      save: () =>
        new Promise<void>((resolve, reject) =>
          pending.push({ resolve, reject }),
        ),
    };
    await renderScreen({ store });
    fireEvent.click(within(slot(1)).getByRole("button", { name: "연결 해제" }));
    fireEvent.click(within(slot(2)).getByRole("button", { name: "연결 해제" }));
    await act(async () => pending[0].reject(new Error("disk")));
    expect(
      screen.queryByText("설정을 저장하지 못했습니다."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "슬롯 2 — 프린터 없음" }),
    ).toBeInTheDocument();
    await act(async () => pending[1].resolve());
  });

  it("설정을 읽지 못하면 문구를 보이고 칸을 비운 채 고치기를 막는다", async () => {
    const save = vi.fn();
    await renderScreen({
      store: { load: vi.fn().mockRejectedValue(new Error("locked")), save },
    });
    expect(screen.getByText("설정을 불러오지 못했습니다.")).toBeInTheDocument();
    for (const n of [1, 2, 3]) {
      expect(
        screen.getByRole("heading", { name: `슬롯 ${n} — 프린터 없음` }),
      ).toBeInTheDocument();
      expect(
        within(slot(n)).getByRole("button", { name: "+ 프린터 추가" }),
      ).toBeDisabled();
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("프린터 목록을 못 읽으면 (찾을 수 없음)을 붙이지 않는다", async () => {
    let rejected: Promise<string[]> = Promise.resolve([]);
    const listPrinters = vi.fn(() => {
      rejected = Promise.reject(new Error("spooler"));
      return rejected;
    });
    await renderScreen({
      printerApi: { listPrinters, printTestPage: vi.fn() },
      store: createMemoryPrinterSettingsStore(settingsWith("A")),
    });
    // 거절이 화면에 반영될 때까지 기다린 뒤 본다.
    await act(async () => {
      await rejected.catch(() => {});
    });
    expect(listPrinters).toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "슬롯 1 — A" }),
    ).toBeInTheDocument();
  });

  it("지금 Windows 목록에 없는 프린터는 칸을 두고 (찾을 수 없음)을 붙인다", async () => {
    await renderScreen({
      store: createMemoryPrinterSettingsStore(settingsWith("사라진 프린터")),
    });
    expect(
      await screen.findByRole("heading", {
        name: "슬롯 1 — 사라진 프린터 (찾을 수 없음)",
      }),
    ).toBeInTheDocument();
  });

  describe("시험 인쇄", () => {
    it("그 프린터로 시험 페이지를 보내고 성공 문구를 보인다", async () => {
      const printerApi = createFakePrinterApi(["A"]);
      const store = createMemoryPrinterSettingsStore(
        updateSlot(settingsWith("A"), 0, { purpose: "카운터 영수증" }),
      );
      await renderScreen({ printerApi, store });
      fireEvent.click(
        within(slot(1)).getByRole("button", { name: "시험 인쇄" }),
      );
      expect(
        await within(slot(1)).findByText("시험 인쇄를 보냈습니다."),
      ).toBeInTheDocument();
      expect(printerApi.printed).toHaveLength(1);
      expect(printerApi.printed[0].printerName).toBe("A");
      expect(printerApi.printed[0].lines).toContain("용도: 카운터 영수증");
      expect(printerApi.printed[0].lines).toContain(`점포: ${STORE_NAME}`);
    });

    it("실패하면 실패 문구를 보인다", async () => {
      const printerApi: PrinterApi = {
        listPrinters: async () => ["A"],
        printTestPage: vi.fn().mockRejectedValue(new Error("no printer")),
      };
      await renderScreen({
        printerApi,
        store: createMemoryPrinterSettingsStore(settingsWith("A")),
      });
      fireEvent.click(
        within(slot(1)).getByRole("button", { name: "시험 인쇄" }),
      );
      expect(
        await within(slot(1)).findByText(
          "시험 인쇄에 실패했습니다. 프린터 연결과 드라이버를 확인해 주세요.",
        ),
      ).toBeInTheDocument();
    });

    it("보내는 동안 다시 누를 수 없다", async () => {
      let finish = () => {};
      const printTestPage = vi.fn(
        () => new Promise<void>((resolve) => (finish = resolve)),
      );
      await renderScreen({
        printerApi: { listPrinters: async () => ["A"], printTestPage },
        store: createMemoryPrinterSettingsStore(settingsWith("A")),
      });
      const button = within(slot(1)).getByRole("button", { name: "시험 인쇄" });
      fireEvent.click(button);
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(printTestPage).toHaveBeenCalledTimes(1);
      await act(async () => finish());
      expect(button).toBeEnabled();
    });
  });

  it("점포번호 계정이면 안내 줄을 보이고, 마스터면 보이지 않는다", async () => {
    const notice =
      "프린터 설정은 마스터 계정만 변경할 수 있습니다. 시험 인쇄는 가능합니다.";
    await renderScreen({ canEdit: false });
    expect(screen.getByText(notice)).toBeInTheDocument();
    cleanup();
    await renderScreen({ canEdit: true });
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
  });

  it("점포번호 계정은 설정을 바꿀 수 없고 시험 인쇄만 할 수 있다", async () => {
    await renderScreen({
      canEdit: false,
      store: createMemoryPrinterSettingsStore(settingsWith("A")),
    });
    const filled = within(slot(1));
    expect(
      filled.getByRole("button", { name: "용도 이름 고치기" }),
    ).toBeDisabled();
    expect(filled.getByRole("checkbox", { name: "주문서" })).toBeDisabled();
    expect(
      filled.getByRole("checkbox", { name: "영수증 (고객 요청 시)" }),
    ).toBeDisabled();
    expect(filled.getByRole("button", { name: "연결 해제" })).toBeDisabled();
    expect(filled.getByRole("button", { name: "시험 인쇄" })).toBeEnabled();
    expect(
      within(slot(2)).getByRole("button", { name: "+ 프린터 추가" }),
    ).toBeDisabled();
  });
});
