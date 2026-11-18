// 창 크기 · 위치 기억 (스펙 2.5, Q07 · Q15). 비밀값이 아니라 localStorage(이 PC의 앱 데이터)에 둔다.
// 좌표 · 크기는 물리 픽셀이다 (위치는 창 바깥 기준, 크기는 안쪽 기준. 지금은 테두리가 없어 같다). 읽기 · 쓰기가 실패해도 창은 열려야 하므로 실패는 삼킨다.
const KEY = "windowBounds";

/** 창을 줄일 수 있는 가장 작은 크기 (논리 픽셀). src-tauri/tauri.conf.json의 minWidth · minHeight와 같게 둔다. */
export const MIN_WINDOW_SIZE = { width: 1024, height: 700 } as const;
/** "창 줄이기"의 기본 크기 (논리 픽셀). src-tauri/tauri.conf.json의 시작 창 width · height와 같게 둔다. */
export const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800 } as const;

/** x~height는 마지막 보통 크기다(최대화 중에도 그대로 남는다). 보통 크기였던 적이 없으면(처음부터 최대화) maximized만 있다. */
export interface SavedBounds {
  maximized: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 작업표시줄을 뺀 화면(논리 픽셀)이 기본 크기보다 작으면 그 화면 크기로 맞추되, 최소 크기보다는 작게 하지 않는다.
 * 최소 크기보다 작은 화면은 지원하지 않는다 (사용자 결정 2026-11-18). 그런 화면용 처리는 만들지 않는다.
 */
export function defaultWindowSize(workArea: { width: number; height: number }) {
  return {
    width: Math.max(
      MIN_WINDOW_SIZE.width,
      Math.min(DEFAULT_WINDOW_SIZE.width, workArea.width),
    ),
    height: Math.max(
      MIN_WINDOW_SIZE.height,
      Math.min(DEFAULT_WINDOW_SIZE.height, workArea.height),
    ),
  };
}

/**
 * 저장값을 그대로 되살려도 되면 돌려주고, 아니면 null(= 기본인 화면 전체로 연다).
 * 크기가 없고 최대화만 저장된 값은 그대로 돌려준다.
 */
export function pickRestorableBounds(
  saved: SavedBounds | null,
  monitors: MonitorRect[],
  scaleFactor: number,
): SavedBounds | null {
  if (!saved) return null;
  const { x, y, width, height } = saved;
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined
  )
    return saved.maximized ? saved : null;
  if (
    width / scaleFactor < MIN_WINDOW_SIZE.width ||
    height / scaleFactor < MIN_WINDOW_SIZE.height
  ) {
    return null;
  }
  // 창 윗줄 가운데가 어느 모니터 안에 있어야 끌어서 옮길 수 있다.
  const { x: px, y: py } = visiblePoint({ x, y, width });
  const visible = monitors.some(
    (m) => px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height,
  );
  return visible ? saved : null;
}

/** 창이 모니터 안에 보이는지 · 어느 모니터에 있었는지 판단하는 기준점 (창 윗줄 가운데). */
export function visiblePoint(b: { x: number; y: number; width: number }) {
  return { x: b.x + b.width / 2, y: b.y + 10 };
}

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function loadSavedBounds(): SavedBounds | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return null;
    const v = raw as Record<string, unknown>;
    if (typeof v.maximized !== "boolean") return null;
    if (v.width === undefined) return { maximized: v.maximized };
    if (![v.x, v.y, v.width, v.height].every(isNum)) return null;
    return v as unknown as SavedBounds;
  } catch {
    return null;
  }
}

export function saveBounds(bounds: SavedBounds): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(bounds));
  } catch {
    // 기억하지 못할 뿐이다. 다음 실행은 화면 전체로 열린다.
  }
}
