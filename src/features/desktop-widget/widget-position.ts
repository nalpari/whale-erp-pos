// 위젯 창을 주 모니터 작업 영역(작업표시줄 제외)의 네 모서리 중 하나에 놓는 계산 (T06 스펙 3.1 · 11장 E, 위치 선택은 T10). 기본은 오른쪽 아래.
export const WIDGET_WIDTH = 340;
export const WIDGET_MARGIN = 16;

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const WIDGET_POSITIONS = [
  "top-right",
  "top-left",
  "bottom-right",
  "bottom-left",
] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

/** 작업 영역은 실제 픽셀, 크기 · 여백은 논리 픽셀이라 배율(scale)로 맞춘다. 높이는 화면을 넘지 않게 자른다. */
export function widgetBounds(
  area: WorkArea,
  scale: number,
  contentHeight: number,
  position: WidgetPosition = "bottom-right",
): { logicalHeight: number; x: number; y: number } {
  const maxHeight = area.height / scale - 2 * WIDGET_MARGIN;
  const logicalHeight = Math.max(1, Math.min(contentHeight, maxHeight));
  return {
    logicalHeight,
    x: Math.round(
      position.endsWith("left")
        ? area.x + WIDGET_MARGIN * scale
        : area.x + area.width - (WIDGET_WIDTH + WIDGET_MARGIN) * scale,
    ),
    y: Math.round(
      position.startsWith("top")
        ? area.y + WIDGET_MARGIN * scale
        : area.y + area.height - (logicalHeight + WIDGET_MARGIN) * scale,
    ),
  };
}
