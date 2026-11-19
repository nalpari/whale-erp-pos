// 주문내역의 순수 함수: 기간 · 달력 · 문구 (SPEC-order-history 2장). 화면과 서버를 모른다.
import {
  addDays,
  dayDiff,
  sameDayLastMonth,
  startOfDay,
} from "../../shared/date-days";
import type {
  HistoryItem,
  HistoryOrder,
  HistorySummary,
  HistoryTab,
} from "../../shared/api/order-history";

/** 조회 기간. 두 값 모두 그날 0시(ms)이고 끝 날짜를 포함한다. */
export interface Period {
  from: number;
  to: number;
}

export const PRESET_IDS = [
  "today",
  "yesterday",
  "this-month",
  "last-month",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

/** 조회할 수 있는 첫 날 (한 달 전 같은 날, Q34). */
export const earliestDay = (now: number) => sameDayLastMonth(startOfDay(now));

export function presets(now: number): Record<PresetId, Period> {
  const today = startOfDay(now);
  const d = new Date(today);
  return {
    today: { from: today, to: today },
    yesterday: { from: addDays(today, -1), to: addDays(today, -1) },
    "this-month": {
      from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      to: today,
    },
    "last-month": { from: earliestDay(now), to: today },
  };
}

export function isSelectableDay(day: number, now: number): boolean {
  return day >= earliestDay(now) && day <= startOfDay(now);
}

/** `<` `>`: 기간 길이만큼 옮긴다. 조회 범위를 조금이라도 벗어나면 null(막힘). */
export function shiftPeriod(
  period: Period,
  direction: 1 | -1,
  now: number,
): Period | null {
  const length = dayDiff(period.from, period.to) + 1;
  const next = {
    from: addDays(period.from, direction * length),
    to: addDays(period.to, direction * length),
  };
  return isSelectableDay(next.from, now) && isSelectableDay(next.to, now)
    ? next
    : null;
}

export interface DaySelection {
  selection: Period | null;
  /** 첫 날을 눌렀고 끝 날을 기다리는 중. */
  pickingEnd: boolean;
}

/** 달력에서 날짜 하나를 눌렀을 때: 처음 누르면 하루, 이어서 누르면 기간(앞뒤가 바뀌어도 맞춘다). */
export function pickDay(
  selection: Period | null,
  pickingEnd: boolean,
  day: number,
): DaySelection {
  if (!pickingEnd || !selection) {
    return { selection: { from: day, to: day }, pickingEnd: true };
  }
  const anchor = selection.from;
  return {
    selection: { from: Math.min(anchor, day), to: Math.max(anchor, day) },
    pickingEnd: false,
  };
}

/** 한 달 격자(일요일 시작). 달에 속하지 않는 칸은 null. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const lead = new Date(year, month - 1, 1).getDay();
  const length = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length }, (_, i) =>
      new Date(year, month - 1, i + 1).getTime(),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7),
  );
}

/** 달력이 보여 줄 수 있는 달(조회 범위가 걸친 달). */
export function monthsInRange(now: number): { year: number; month: number }[] {
  const first = new Date(earliestDay(now));
  const last = new Date(startOfDay(now));
  const months = [{ year: first.getFullYear(), month: first.getMonth() + 1 }];
  if (
    first.getFullYear() !== last.getFullYear() ||
    first.getMonth() !== last.getMonth()
  ) {
    months.push({ year: last.getFullYear(), month: last.getMonth() + 1 });
  }
  return months;
}

const pad = (n: number) => String(n).padStart(2, "0");
const md = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};

export function formatPeriod(period: Period): string {
  return period.from === period.to
    ? md(period.from)
    : `${md(period.from)} ~ ${md(period.to)}`;
}

/** 목록의 주문일시 「11.17 13:21」. */
export function formatRowTime(ms: number): string {
  const d = new Date(ms);
  return `${md(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 첫 메뉴 + 나머지 메뉴 종류 수 (수량이 아니다, T04 Q24와 같은 셈). */
export function menuLine(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names[0]} 외 ${names.length - 1}개`;
}

export function formatWon(amount: number): string {
  return `₩${String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** 「3번째 주문」, 첫 주문이면 「첫 주문」 (Q29). */
export function orderCountLabel(count: number): string {
  return count <= 1 ? "첫 주문" : `${count}번째 주문`;
}

/** 요약 줄 3가지 (Q35). 건수는 탭 숫자 그대로, 금액은 서버가 센 값이다. */
export function summaryLine(
  tab: HistoryTab,
  counts: Record<HistoryTab, number>,
  summary: HistorySummary,
): string {
  const head = `총 ${counts[tab]}건`;
  if (tab === "cancelled")
    return `${head} · 취소 금액 ${formatWon(summary.amount)}`;
  const base = `${head} · 결제 합계 ${formatWon(summary.amount)}`;
  return tab === "all"
    ? `${base} (취소 ${summary.excludedCancelCount}건 제외)`
    : base;
}

/** 검색어: 앞뒤 공백 · `#`을 떼고 숫자만 남긴다 (휴대폰 끝 4자리 · 픽업번호 · 주문번호는 모두 숫자). */
export function normalizeQuery(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** 페이지 번호 버튼: 현재 페이지 둘레 span개 (끝에 닿으면 반대쪽으로 채운다). */
export function pageWindow(current: number, total: number, span = 5): number[] {
  const size = Math.min(span, total);
  const start = Math.min(
    Math.max(1, current - Math.floor(size / 2)),
    total - size + 1,
  );
  return Array.from({ length: size }, (_, i) => start + i);
}

/** 메뉴 한 줄의 금액: (단가 + 옵션 금액) × 수량. */
export function lineTotal(item: HistoryItem): number {
  return (
    item.quantity *
    (item.unitPrice + item.options.reduce((sum, o) => sum + o.price, 0))
  );
}

export interface HistoryEntry {
  label: string;
  at: number;
  /** 취소 사유 (직접 입력은 고객에게 보인 문구 그대로). */
  note?: string;
}

const CANCEL_BY_LABEL = {
  store: "매장취소",
  customer: "고객취소",
  auto: "자동 취소",
} as const;

/** 처리 이력 (3장 6): 결제 · 제조중 · 제조완료 · 픽업완료 시각, 취소면 취소 시각 · 누가 · 사유. 시각이 없는 단계는 뺀다. */
export function historyEntries(order: HistoryOrder): HistoryEntry[] {
  const t = order.statusTimes;
  const entries: HistoryEntry[] = [{ label: "결제(주문)", at: order.paidAt }];
  if (t.preparingAt !== null)
    entries.push({ label: "제조중", at: t.preparingAt });
  if (t.readyAt !== null) entries.push({ label: "제조완료", at: t.readyAt });
  if (t.pickedUpAt !== null)
    entries.push({ label: "픽업완료", at: t.pickedUpAt });
  if (order.cancel) {
    entries.push({
      label: CANCEL_BY_LABEL[order.cancel.by],
      at: order.cancel.at,
      note: order.cancel.reason ?? undefined,
    });
  }
  return entries;
}
