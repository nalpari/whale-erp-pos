// 날짜(하루 단위) 계산. 모든 값은 그날 0시의 ms다 (PC 시계 기준, 주문내역 SPEC 2.1).

export const DAY_MS = 86_400_000;

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 날짜를 n일 옮긴다. 24시간을 더하지 않고 달력으로 옮겨 서머타임이 있어도 0시를 지킨다. */
export function addDays(dayMs: number, n: number): number {
  const d = new Date(dayMs);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** 두 날짜 사이의 일 수 (to - from). */
export function dayDiff(from: number, to: number): number {
  return Math.round((to - from) / DAY_MS);
}

/** 한 달 전 같은 날. 그 달에 없는 날(3/31 → 2/28)이면 그 달의 마지막 날로 맞춘다. */
export function sameDayLastMonth(dayMs: number): number {
  const d = new Date(startOfDay(dayMs));
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.getTime();
}
