import { describe, expect, it } from "vitest";
import { widgetBounds } from "./widget-position";

const screen = { x: 0, y: 0, width: 1920, height: 1040 }; // 작업표시줄 40px 뺀 영역

describe("widgetBounds", () => {
  it("오른쪽 아래에서 여백 16px을 띄운다", () => {
    expect(widgetBounds(screen, 1, 300)).toEqual({
      logicalHeight: 300,
      x: 1920 - 340 - 16,
      y: 1040 - 300 - 16,
    });
  });
  it("배율 150%면 여백과 크기도 150%로 계산한다", () => {
    const b = widgetBounds({ ...screen, width: 2880, height: 1560 }, 1.5, 300);
    expect(b.x).toBe(2880 - 356 * 1.5);
    expect(b.y).toBe(1560 - 316 * 1.5);
  });
  it("화면 높이를 넘으면 자르고, 두 번째 모니터 좌표를 더한다", () => {
    const b = widgetBounds(
      { x: 1920, y: 0, width: 1920, height: 600 },
      1,
      2000,
    );
    expect(b.logicalHeight).toBe(600 - 32);
    expect(b.x).toBe(1920 + 1920 - 356);
    expect(b.y).toBe(16);
  });
});
