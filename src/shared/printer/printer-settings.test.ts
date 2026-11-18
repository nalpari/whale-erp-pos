import { describe, expect, it } from "vitest";
import {
  assignPrinter,
  createEmptyPrinterSettings,
  hasOrderPrinter,
  isPrinterTaken,
  removePrinter,
  updateSlot,
  type PrinterSettings,
} from "./printer-settings";

function withPrinter(name: string, index: 0 | 1 | 2): PrinterSettings {
  return assignPrinter(createEmptyPrinterSettings(), index, name);
}

describe("프린터 설정", () => {
  it("처음에는 세 칸 모두 비어 있다", () => {
    expect(createEmptyPrinterSettings()).toEqual({
      version: 1,
      slots: [null, null, null],
    });
  });

  it("등록하면 용도는 빈 값, 주문서 체크, 영수증 해제로 들어간다", () => {
    expect(withPrinter("Microsoft Print to PDF", 1).slots).toEqual([
      null,
      {
        printerName: "Microsoft Print to PDF",
        purpose: "",
        printOrder: true,
        printReceipt: false,
        paperWidth: 80,
      },
      null,
    ]);
  });

  it("주문서가 체크된 칸이 하나도 없으면 주문서 프린터 없음", () => {
    expect(hasOrderPrinter(createEmptyPrinterSettings())).toBe(false);
    const one = withPrinter("A", 0);
    expect(hasOrderPrinter(one)).toBe(true);
    expect(hasOrderPrinter(updateSlot(one, 0, { printOrder: false }))).toBe(
      false,
    );
  });

  it("주문서 프린터 판단은 어느 칸이든 하나라도 체크됐는지 본다", () => {
    expect(hasOrderPrinter(withPrinter("B", 1))).toBe(true);
    const mixed = updateSlot(assignPrinter(withPrinter("A", 0), 1, "B"), 0, {
      printOrder: false,
    });
    expect(hasOrderPrinter(mixed)).toBe(true);
  });

  it("용지 폭을 바꾼다", () => {
    expect(
      updateSlot(withPrinter("A", 0), 0, { paperWidth: 58 }).slots[0]
        ?.paperWidth,
    ).toBe(58);
  });

  it("다른 칸에 있는 프린터는 등록하지 않는다", () => {
    const settings = withPrinter("A", 0);
    expect(isPrinterTaken(settings, "A")).toBe(true);
    expect(isPrinterTaken(settings, "B")).toBe(false);
    expect(() => assignPrinter(settings, 2, "A")).toThrow();
  });

  it("해제하면 그 칸만 빈다", () => {
    const settings = assignPrinter(withPrinter("A", 0), 1, "B");
    expect(removePrinter(settings, 0).slots).toEqual([
      null,
      settings.slots[1],
      null,
    ]);
  });

  it("용도와 출력 항목을 바꾼다. 원래 값은 그대로 둔다", () => {
    const before = withPrinter("A", 0);
    const after = updateSlot(before, 0, {
      purpose: "카운터 영수증",
      printReceipt: true,
    });
    expect(after.slots[0]).toEqual({
      printerName: "A",
      purpose: "카운터 영수증",
      printOrder: true,
      printReceipt: true,
      paperWidth: 80,
    });
    expect(before.slots[0]?.purpose).toBe("");
  });

  it("빈 칸은 바꾸지 않는다", () => {
    const settings = createEmptyPrinterSettings();
    expect(updateSlot(settings, 0, { purpose: "x" })).toBe(settings);
  });
});
