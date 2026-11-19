// 위젯 창을 주 모니터 작업 영역(작업표시줄 제외)의 오른쪽 아래에 놓는 계산 (T06 스펙 3.1 · 11장 E).
export const WIDGET_WIDTH = 340;
export const WIDGET_MARGIN = 16;

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 작업 영역은 실제 픽셀, 크기 · 여백은 논리 픽셀이라 배율(scale)로 맞춘다. 높이는 화면을 넘지 않게 자른다. */
export function widgetBounds(
  area: WorkArea,
  scale: number,
  contentHeight: number,
): { logicalHeight: number; x: number; y: number } {
  const maxHeight = area.height / scale - 2 * WIDGET_MARGIN;
  const logicalHeight = Math.max(1, Math.min(contentHeight, maxHeight));
  return {
    logicalHeight,
    x: Math.round(area.x + area.width - (WIDGET_WIDTH + WIDGET_MARGIN) * scale),
    y: Math.round(
      area.y + area.height - (logicalHeight + WIDGET_MARGIN) * scale,
    ),
  };
}
