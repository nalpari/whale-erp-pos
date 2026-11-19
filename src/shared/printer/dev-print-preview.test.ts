import { beforeEach, describe, expect, it } from "vitest";
import { devPrintPreview, withDevPreview } from "./dev-print-preview";
import { createFakePrinterApi } from "./printer-api";

beforeEach(() => devPrintPreview.clear());

describe("개발용 출력 미리보기 (T12 스펙 11장 C)", () => {
  it("출력은 실제 프린터 대신 미리보기에 쌓이고 성공으로 끝난다", async () => {
    const base = createFakePrinterApi([]);
    const api = withDevPreview(base, ["시험 프린터"]);
    await api.printDocument("A", {
      docName: "주문서",
      paperWidth: 58,
      lines: [{ text: "가나다" }],
    });
    await api.printTestPage("B", ["시험"]);
    expect(base.documents).toEqual([]);
    const [test, doc] = devPrintPreview.getSnapshot();
    expect(doc).toMatchObject({ printerName: "A", paperWidth: 58 });
    expect(test).toMatchObject({ printerName: "B", paperWidth: 80 });
    expect(test.lines).toEqual([{ text: "시험" }]);
  });

  it("프린터 목록이 비면(Linux) 시험용 이름을 보인다", async () => {
    const api = withDevPreview(createFakePrinterApi([]), ["시험 프린터"]);
    expect(await api.listPrinters()).toEqual(["시험 프린터"]);
  });

  it("바뀔 때만 구독자에게 알린다", async () => {
    let calls = 0;
    const off = devPrintPreview.subscribe(() => (calls += 1));
    devPrintPreview.push("A", { docName: "d", paperWidth: 80, lines: [] });
    devPrintPreview.clear();
    off();
    devPrintPreview.clear();
    expect(calls).toBe(2);
  });
});
