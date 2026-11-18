import { describe, expect, it } from "vitest";
import {
  defaultWindowSize,
  loadSavedBounds,
  pickRestorableBounds,
  saveBounds,
  type SavedBounds,
} from "./window-bounds";

const MONITORS = [{ x: 0, y: 0, width: 1920, height: 1080 }];
const OK: SavedBounds = {
  x: 100,
  y: 80,
  width: 1280,
  height: 800,
  maximized: false,
};

describe("pickRestorableBounds (스펙 2.5)", () => {
  it("저장값이 없으면 버린다 (처음 실행은 화면 전체)", () => {
    expect(pickRestorableBounds(null, MONITORS, 1)).toBeNull();
  });

  it("최소 크기 이상이고 모니터 안이면 그대로 쓴다", () => {
    expect(pickRestorableBounds(OK, MONITORS, 1)).toEqual(OK);
  });

  it("논리 크기가 최소(1024 × 700)보다 작으면 버린다 (배율 고려)", () => {
    expect(
      pickRestorableBounds({ ...OK, width: 1000 }, MONITORS, 1),
    ).toBeNull();
    expect(
      pickRestorableBounds({ ...OK, height: 699 }, MONITORS, 1),
    ).toBeNull();
    // 배율 1.5: 물리 1500px = 논리 1000px
    expect(
      pickRestorableBounds({ ...OK, width: 1500 }, MONITORS, 1.5),
    ).toBeNull();
    expect(
      pickRestorableBounds({ ...OK, width: 1536, height: 1100 }, MONITORS, 1.5),
    ).not.toBeNull();
  });

  it("창 윗부분이 어느 모니터에도 없으면 버린다 (모니터를 뺀 경우)", () => {
    expect(pickRestorableBounds({ ...OK, x: 3000 }, MONITORS, 1)).toBeNull();
    expect(pickRestorableBounds({ ...OK, y: -2000 }, MONITORS, 1)).toBeNull();
  });

  it("두 번째 모니터(음수 좌표)에 있던 창은 그 모니터가 있으면 쓴다", () => {
    const two = [{ x: -1920, y: 0, width: 1920, height: 1080 }, ...MONITORS];
    const saved = { ...OK, x: -1800 };
    expect(pickRestorableBounds(saved, two, 1)).toEqual(saved);
    expect(pickRestorableBounds(saved, MONITORS, 1)).toBeNull();
  });

  it("최대화만 저장된 값(크기 없음)은 최대화 여부만 쓴다", () => {
    const max: SavedBounds = { maximized: true };
    expect(pickRestorableBounds(max, MONITORS, 1)).toEqual(max);
  });
});

describe("defaultWindowSize (스펙 2.4)", () => {
  it("작업표시줄을 뺀 화면이 충분히 크면 1280 × 800", () => {
    expect(defaultWindowSize({ width: 1920, height: 1040 })).toEqual({
      width: 1280,
      height: 800,
    });
  });

  it("화면이 최소 크기보다 작아도 1024 × 700보다 작게 하지 않는다", () => {
    expect(defaultWindowSize({ width: 900, height: 500 })).toEqual({
      width: 1024,
      height: 700,
    });
  });

  it("화면이 작으면 작업표시줄을 뺀 화면 크기", () => {
    expect(defaultWindowSize({ width: 1024, height: 728 })).toEqual({
      width: 1024,
      height: 728,
    });
  });
});

describe("저장 · 읽기", () => {
  it("저장한 값을 읽는다", () => {
    saveBounds(OK);
    expect(loadSavedBounds()).toEqual(OK);
  });

  it("없거나 손상된 값이면 null", () => {
    expect(loadSavedBounds()).toBeNull();
    localStorage.setItem("windowBounds", "{깨짐");
    expect(loadSavedBounds()).toBeNull();
    localStorage.setItem("windowBounds", JSON.stringify({ x: "a" }));
    expect(loadSavedBounds()).toBeNull();
    localStorage.setItem(
      "windowBounds",
      JSON.stringify({
        maximized: false,
        x: 1,
        y: "80",
        width: 1280,
        height: null,
      }),
    );
    expect(loadSavedBounds()).toBeNull();
  });
});
