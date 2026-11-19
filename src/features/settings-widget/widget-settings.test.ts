import { beforeEach, describe, expect, it, vi } from "vitest";
import * as logModule from "../../shared/log/log";
import {
  DEFAULT_WIDGET_SETTINGS,
  loadWidgetSettings,
  normalizeVolume,
  saveWidgetSettings,
  widgetStatuses,
} from "./widget-settings";

const KEY = "widgetSettings";

describe("위젯 설정 읽기 · 쓰기", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("저장된 게 없으면 기본값이다 (우하단, 40, 모두 표시) — 로그는 남기지 않는다", () => {
    const logged = vi.spyOn(logModule, "logInfo").mockResolvedValue();
    expect(loadWidgetSettings()).toEqual({
      showPreparing: true,
      showReady: true,
      position: "bottom-right",
      volume: 40,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("저장한 값을 그대로 읽는다", () => {
    const next = {
      showPreparing: false,
      showReady: true,
      position: "top-left" as const,
      volume: 80,
    };
    saveWidgetSettings(next);
    expect(loadWidgetSettings()).toEqual(next);
  });

  it("깨진 값이면 기본값으로 시작하고 로그를 남긴다", () => {
    const logged = vi.spyOn(logModule, "logInfo").mockResolvedValue();
    localStorage.setItem(KEY, "{깨짐");
    expect(loadWidgetSettings()).toEqual(DEFAULT_WIDGET_SETTINGS);
    expect(logged).toHaveBeenCalledWith("설정 읽기 실패");
  });

  it("항목 하나가 이상하면 그 항목만 기본값이고 로그를 남긴다", () => {
    const logged = vi.spyOn(logModule, "logInfo").mockResolvedValue();
    localStorage.setItem(
      KEY,
      JSON.stringify({ showPreparing: false, position: "가운데", volume: "x" }),
    );
    expect(loadWidgetSettings()).toEqual({
      ...DEFAULT_WIDGET_SETTINGS,
      showPreparing: false,
    });
    expect(logged).toHaveBeenCalledWith("설정 읽기 실패");
  });

  it("불린 항목 하나만 깨져도 그 항목은 기본값이고 로그를 남긴다", () => {
    const logged = vi.spyOn(logModule, "logInfo").mockResolvedValue();
    localStorage.setItem(
      KEY,
      JSON.stringify({ showPreparing: true, position: "top-left", volume: 60 }),
    );
    expect(loadWidgetSettings()).toEqual({
      showPreparing: true,
      showReady: true,
      position: "top-left",
      volume: 60,
    });
    expect(logged).toHaveBeenCalledWith("설정 읽기 실패");
  });

  it("범위 밖 크기는 20~100으로 맞추고 10 단위로 맞춘다", () => {
    expect(normalizeVolume(0)).toBe(20);
    expect(normalizeVolume(500)).toBe(100);
    expect(normalizeVolume(44)).toBe(40);
    expect(normalizeVolume(Number.NaN)).toBe(40);
  });

  it("저장소가 막혀 있으면 저장 실패를 로그에 남기고 false를 돌려준다", () => {
    const logged = vi.spyOn(logModule, "logInfo").mockResolvedValue();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(saveWidgetSettings(DEFAULT_WIDGET_SETTINGS)).toBe(false);
    expect(logged).toHaveBeenCalledWith("설정 저장 실패");
  });

  it("접수대기는 설정과 상관없이 늘 위젯에 보인다", () => {
    expect(
      widgetStatuses({
        ...DEFAULT_WIDGET_SETTINGS,
        showPreparing: false,
        showReady: false,
      }),
    ).toEqual(new Set(["pending"]));
    expect(widgetStatuses(DEFAULT_WIDGET_SETTINGS)).toEqual(
      new Set(["pending", "preparing", "ready"]),
    );
  });
});
