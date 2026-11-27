// 주문접수 화면의 순수 함수 (SPEC-order-board 3장). 현재 시각은 늘 인자로 받는다 (가짜 시계로 시험).
import {
  isCancelledStatus,
  type Order,
  type OrderItem,
} from "../../shared/api/orders";

const MIN = 60_000;
/** 자동 취소 예정 시각보다 이만큼 앞서 「3분 뒤 자동 취소」를 보인다 (SPEC-settings-order 5장). */
export const AUTO_CANCEL_WARNING_LEAD_MS = 3 * MIN;
/** 카드에 보이는 메뉴 줄 수 (Q24). */
export const MENU_LINES = 3;

export type SortOrder = "newest" | "oldest";
export type BoardStatus = "pending" | "preparing" | "ready";
export type StatusFilters = Record<BoardStatus, boolean>;
export type StatusCounts = Record<BoardStatus, number>;

export function formatClock(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** PC 시계 기준 그날 0시. [픽업완료] 탭은 오늘 결제한 것만 보인다 (사용자 결정 2026-11-18, Q21의 "오늘"을 결제 기준으로 정함). */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 메뉴 3줄과 「+ 외 N개」의 N. N은 수량이 아니라 남은 메뉴 종류 수다 (Q24). */
export function menuSummary(items: OrderItem[]): {
  shown: OrderItem[];
  moreCount: number;
} {
  return {
    shown: items.slice(0, MENU_LINES),
    moreCount: Math.max(0, items.length - MENU_LINES),
  };
}

export interface ArrivalSchedule {
  label: string;
  /** 괄호 안 글자. 없으면 괄호를 쓰지 않는다. */
  note?: { text: string; overdue: boolean };
}

/** 도착 예정 「HH:mm」. 화면 문구와 주문서 · 영수증이 같이 쓴다 (SPEC-order-board 12장, SPEC-print-forms 12장). */
export function arrivalClock(order: Pick<Order, "arrivalAt">): string {
  return formatClock(order.arrivalAt);
}

/** 이만큼 지나면 분 대신 「1시간 이상 지남」. 0시 자동 픽업완료가 없어 어제 주문에 「710분 지남」이 보이지 않게 한다 (12장 B-1). */
const OVERDUE_CAP_MIN = 60;

/** 「HH:mm 도착 (N분 뒤 | N분 지남 | 1시간 이상 지남)」 (SPEC-order-board 12장). */
export function arrivalSchedule(
  order: Pick<Order, "arrivalAt">,
  now: number,
): ArrivalSchedule {
  const label = `${arrivalClock(order)} 도착`;
  // 도착 시각 · 현재 시각 모두 초를 버린 분으로 센다: 보이는 「HH:mm」과 괄호 숫자가 어긋나지 않게 (12장 A-1).
  // 같은 분이면 괄호가 없다 (「0분 뒤 · 0분 지남」 없음).
  const diff = Math.floor(now / MIN) - Math.floor(order.arrivalAt / MIN);
  if (diff === 0) return { label };
  if (diff < 0)
    return { label, note: { text: `${-diff}분 뒤`, overdue: false } };
  const text = diff >= OVERDUE_CAP_MIN ? "1시간 이상 지남" : `${diff}분 지남`;
  return { label, note: { text, overdue: true } };
}

export function showAutoCancelWarning(order: Order, now: number): boolean {
  return (
    order.status === "pending" &&
    now >= order.autoCancelAt - AUTO_CANCEL_WARNING_LEAD_MS
  );
}

export function countByStatus(orders: Order[]): StatusCounts {
  const counts: StatusCounts = { pending: 0, preparing: 0, ready: 0 };
  for (const o of orders) {
    if (
      o.status === "pending" ||
      o.status === "preparing" ||
      o.status === "ready"
    )
      counts[o.status] += 1;
  }
  return counts;
}

/** 접수대기였다가 이번에 고객취소로 바뀐 주문 (배너 · 알림음 기준, 스펙 2.7). 처음 보는 주문은 이전 상태가 없어 걸러진다. */
export function newlyCustomerCancelled(
  before: ReadonlyMap<string, Order["status"]>,
  orders: Order[],
): Order[] {
  return orders.filter(
    (o) =>
      before.get(o.orderId) === "pending" && o.status === "customer-cancelled",
  );
}

export function statusSnapshot(orders: Order[]): Map<string, Order["status"]> {
  return new Map(orders.map((o) => [o.orderId, o.status]));
}

export interface SplitOptions {
  sort: SortOrder;
  filters: StatusFilters;
  /** 날짜(그날 0시) 계산에만 쓴다. 호출부는 0시 값을 넘겨도 된다. */
  now: number;
  /** 방금 [픽업완료]를 눌러 5초 배너가 떠 있는 주문. 첫 탭에 남긴다 (Q21). */
  lingering: ReadonlySet<string>;
}

/** 결제 시각 순서. 같으면 orderId로 순서를 고정한다 (화면이 흔들리지 않게). */
function bySort(sort: SortOrder) {
  const sign = sort === "newest" ? -1 : 1;
  return (a: Order, b: Order) =>
    sign * (a.paidAt - b.paidAt || a.orderId.localeCompare(b.orderId));
}

/** 두 탭에 보일 주문과 보기 필터 건수. 취소된 주문은 어느 탭에도 없다 (Q17 · Q19). */
export function splitOrders(
  orders: Order[],
  { sort, filters, now, lingering }: SplitOptions,
): { board: Order[]; pickedUp: Order[]; counts: StatusCounts } {
  const dayStart = startOfDay(now);
  const board: Order[] = [];
  const pickedUp: Order[] = [];
  for (const o of orders) {
    if (isCancelledStatus(o.status)) {
      continue; // 5초 배너 동안 취소해도 카드를 남기지 않는다 (T18: 픽업완료도 취소할 수 있다)
    }
    if (lingering.has(o.orderId)) {
      board.push(o);
    } else if (
      o.status === "pending" ||
      o.status === "preparing" ||
      o.status === "ready"
    ) {
      if (filters[o.status]) board.push(o);
      // 오늘 결제한 것만 본다. updatedAt(서버 시각)은 어제 주문을 오늘 픽업완료해도 오늘이 되어 쓰지 않는다 (사용자 결정 2026-11-18).
    } else if (o.status === "picked-up" && o.paidAt >= dayStart) {
      pickedUp.push(o);
    }
  }
  return {
    board: board.sort(bySort(sort)),
    pickedUp: pickedUp.sort(bySort("newest")),
    counts: countByStatus(orders),
  };
}
