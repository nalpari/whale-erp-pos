// 위젯설정(보일 상태 · 위치 · 알림음 크기)을 이 PC에 기억한다 (T10 스펙 5장, 11장 B). 정렬 저장(sort-storage.ts)과 같은 localStorage 방식이다.
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import type { WidgetStatus } from "../desktop-widget/widget-logic";
import {
  WIDGET_POSITIONS,
  type WidgetPosition,
} from "../desktop-widget/widget-position";

export interface WidgetSettings {
  /** 접수대기는 늘 보이므로 칸이 없다 (Q31 · 스펙 3장). */
  showPreparing: boolean;
  showReady: boolean;
  position: WidgetPosition;
  /** 알림음 크기. 40이 T06의 지금 소리다 (스펙 4장). */
  volume: number;
}

export const VOLUME_MIN = 20;
export const VOLUME_MAX = 100;
export const VOLUME_STEP = 10;

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  showPreparing: true,
  showReady: true,
  position: "bottom-right",
  volume: 40,
};

const KEY = "widgetSettings";

/** 범위(20~100)와 단계(10)에 맞춘다. 숫자가 아니면 기본값. */
export function normalizeVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WIDGET_SETTINGS.volume;
  const stepped = Math.round(value / VOLUME_STEP) * VOLUME_STEP;
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, stepped));
}

export function loadWidgetSettings(): WidgetSettings {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    void logInfo(logMessages.settingsFailed("load"));
    return DEFAULT_WIDGET_SETTINGS;
  }
  if (raw === null) return DEFAULT_WIDGET_SETTINGS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    void logInfo(logMessages.settingsFailed("load"));
    return DEFAULT_WIDGET_SETTINGS;
  }
  const obj =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  let broken = typeof parsed !== "object" || parsed === null;
  // 항목마다 검사해, 이상한 항목만 기본값으로 둔다. 로그 판단은 모든 항목을 본 뒤에 한다.
  const bool = (key: "showPreparing" | "showReady"): boolean => {
    const value = obj[key];
    if (typeof value === "boolean") return value;
    broken = true;
    return DEFAULT_WIDGET_SETTINGS[key];
  };
  const showPreparing = bool("showPreparing");
  const showReady = bool("showReady");
  const position = WIDGET_POSITIONS.find((p) => p === obj.position);
  const volumeValid =
    typeof obj.volume === "number" && Number.isFinite(obj.volume);
  if (!position || !volumeValid) broken = true;
  if (broken) void logInfo(logMessages.settingsFailed("load"));
  return {
    showPreparing,
    showReady,
    position: position ?? DEFAULT_WIDGET_SETTINGS.position,
    volume: volumeValid
      ? normalizeVolume(obj.volume as number)
      : DEFAULT_WIDGET_SETTINGS.volume,
  };
}

/** 저장에 성공하면 true. 저장소가 막혀 있어도 화면은 떠야 하므로 던지지 않고 로그만 남긴다. */
export function saveWidgetSettings(settings: WidgetSettings): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
    return true;
  } catch {
    void logInfo(logMessages.settingsFailed("save"));
    return false;
  }
}

/** 위젯에 보일 주문 상태. 접수대기는 늘 들어 있다. */
export function widgetStatuses(
  settings: WidgetSettings,
): ReadonlySet<WidgetStatus> {
  const statuses = new Set<WidgetStatus>(["pending"]);
  if (settings.showPreparing) statuses.add("preparing");
  if (settings.showReady) statuses.add("ready");
  return statuses;
}
