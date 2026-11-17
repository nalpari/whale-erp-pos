import { describe, expect, it } from "vitest";
import {
  assignPrinter,
  createEmptyPrinterSettings,
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
      },
      null,
    ]);
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
    });
    expect(before.slots[0]?.purpose).toBe("");
  });

  it("빈 칸은 바꾸지 않는다", () => {
    const settings = createEmptyPrinterSettings();
    expect(updateSlot(settings, 0, { purpose: "x" })).toBe(settings);
  });
});
