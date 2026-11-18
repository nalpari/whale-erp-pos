// 주문접수 화면의 순수 함수 (SPEC-order-board 3장). 현재 시각은 늘 인자로 받는다 (가짜 시계로 시험).
import {
  PICKUP_CHOICE_MINUTES,
  type Order,
  type OrderItem,
} from "../../shared/api/orders";

const MIN = 60_000;
/** 결제 뒤 이만큼 지난 접수대기 주문에 「3분 뒤 자동 취소」를 보인다 (Q20, 15분 자동 취소 3분 전). */
export const AUTO_CANCEL_WARNING_MS = 12 * MIN;
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

export interface PickupSchedule {
  label: string;
  /** 괄호 안 글자. 없으면 괄호를 쓰지 않는다. */
  note?: { text: string; overdue: boolean };
}

/** 픽업 예정 문구 4가지 (Q26). 예정 시각 = 결제 시각 + 고객이 고른 값. */
export function pickupSchedule(order: Order, now: number): PickupSchedule {
  const choice = order.pickupChoice;
  // 값 이름이 아직 가정이라 모르는 값이 와도 "NaN"이 보이지 않게 「지금」으로 본다. 실제 API에서는 통신 계층이 검사한다.
  const minutes: number | undefined = PICKUP_CHOICE_MINUTES[choice];
  const target = order.paidAt + (minutes ?? 0) * MIN;
  const label =
    minutes === undefined || choice === "now"
      ? "지금 픽업"
      : `${formatClock(target)} 픽업`;
  if (now >= target) {
    const late = Math.floor((now - target) / MIN);
    // 예정 시각 뒤 1분이 되기 전에는 괄호를 붙이지 않는다 (Q26에 정해진 문구가 없다).
    return late >= 1
      ? { label, note: { text: `${late}분 지남`, overdue: true } }
      : { label };
  }
  if (choice === "1hour-plus") {
    return { label, note: { text: "1시간 이상", overdue: false } };
  }
  const remaining = Math.ceil((target - now) / MIN);
  return { label, note: { text: `${remaining}분 뒤`, overdue: false } };
}

export function showAutoCancelWarning(order: Order, now: number): boolean {
  return (
    order.status === "pending" && now - order.paidAt >= AUTO_CANCEL_WARNING_MS
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
    if (lingering.has(o.orderId)) {
      board.push(o);
    } else if (
      o.status === "pending" ||
      o.status === "preparing" ||
      o.status === "ready"
    ) {
      if (filters[o.status]) board.push(o);
      // 오늘 결제한 것만 본다. updatedAt(서버 시각)은 0시에 서버가 자동 픽업완료한 어제 주문도 오늘로 만들어 쓰지 않는다 (사용자 결정 2026-11-18).
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
