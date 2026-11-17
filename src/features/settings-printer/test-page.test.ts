import { describe, expect, it } from "vitest";
import { buildTestPageLines } from "./test-page";

const NOW = new Date(2026, 10, 17, 9, 5, 3);

describe("시험 페이지 줄", () => {
  it("스펙 2.3 순서대로 만든다", () => {
    expect(
      buildTestPageLines({
        printerName: "Microsoft Print to PDF",
        purpose: "카운터 영수증",
        storeName: "종로점",
        now: NOW,
      }),
    ).toEqual([
      "픽업오더 주문접수 시험 인쇄",
      "프린터: Microsoft Print to PDF",
      "용도: 카운터 영수증",
      "점포: 종로점",
      "출력 시각: 2026-11-17 09:05:03",
      "가나다라마바사 아메리카노 1잔",
      "0123456789",
    ]);
  });

  it("용도가 빈 값이면 용도 줄을 뺀다", () => {
    const lines = buildTestPageLines({
      printerName: "A",
      purpose: "  ",
      storeName: "종로점",
      now: NOW,
    });
    expect(lines.some((line) => line.startsWith("용도"))).toBe(false);
  });
});
