// 위젯 판단 순수 함수 (T06 스펙 3.2 · 3.3). 시간 · 창 · 서버를 모른다.
import type { Order } from "../../shared/api/orders";
import type { WidgetCardView, WidgetView } from "./widget-protocol";

/** 위젯에 한 번에 보이는 카드 수 (Q31). */
export const WIDGET_MAX_CARDS = 5;
/** 위젯 안 실패 문구가 보이는 시간 (11장 F). */
export const WIDGET_FAILURE_MS = 3000;

export type WidgetStatus = "pending" | "preparing" | "ready";
/** 보일 상태 기본값: 모두 (11장 C, 설정은 T10). 접수대기는 설정과 상관없이 늘 보인다 (3.3). */
export const DEFAULT_WIDGET_STATUSES: ReadonlySet<WidgetStatus> = new Set([
  "pending",
  "preparing",
  "ready",
]);

export interface CardInput {
  /** 카드 [×]로 숨긴 주문. */
  dismissed: ReadonlySet<string>;
  /** [픽업완료] 직후 「완료 취소」 카드가 떠 있는 주문 (마감 시각). */
  lingering: ReadonlyMap<string, number>;
  statuses?: ReadonlySet<WidgetStatus>;
}

/** 보일 주문과 순서: 접수대기가 먼저, 남는 자리에 제조중 · 제조완료. 각각 오래된 주문이 위 (3.3). */
export function pickWidgetOrders(
  orders: readonly Order[],
  { dismissed, lingering, statuses = DEFAULT_WIDGET_STATUSES }: CardInput,
): Order[] {
  const shown = orders.filter((o) => {
    // [픽업완료] 요청 중에는 아직 제조완료라 보통 카드로 보이고, 성공하면 「완료 취소」 카드로 바뀐다.
    if (lingering.has(o.orderId) && o.status === "picked-up") return true;
    if (dismissed.has(o.orderId)) return false;
    if (o.status === "pending") return true;
    return (
      (o.status === "preparing" || o.status === "ready") &&
      statuses.has(o.status)
    );
  });
  const group = (o: Order) => (o.status === "pending" ? 0 : 1);
  return shown.sort(
    (a, b) =>
      group(a) - group(b) ||
      a.paidAt - b.paidAt ||
      a.orderId.localeCompare(b.orderId),
  );
}

/** 최대 장수로 자르고 남은 건수를 센다 (「+ N건 더 있음」). */
export function limitCards<T>(
  cards: readonly T[],
  max = WIDGET_MAX_CARDS,
): { shown: T[]; moreCount: number } {
  return {
    shown: cards.slice(0, max),
    moreCount: Math.max(0, cards.length - max),
  };
}

export function hasPendingOrder(orders: readonly Order[]): boolean {
  return orders.some((o) => o.status === "pending");
}

export interface ViewInput extends CardInput {
  /** 위젯을 띄운 상태인지 (본 창이 앞이 아닐 때 새 주문 · 반복 · 서버 자동 OFF가 켠다). */
  shown: boolean;
  autoOffCard: boolean;
  inFlight: Readonly<Record<string, true>>;
  /** 주문별 실패 문구. */
  failures: Readonly<Record<string, string>>;
  /** 주문서 출력에 실패한 주문 (「미출력」 꼬리표, T12). */
  unprinted?: ReadonlySet<string>;
}

/** 본 창이 위젯에 보내는 화면. 띄운 상태(shown)이고 카드나 자동 OFF 안내가 하나라도 있을 때만 보인다 (3.2). */
export function buildWidgetView(
  orders: readonly Order[],
  input: ViewInput,
): WidgetView {
  const { shown, moreCount } = limitCards(pickWidgetOrders(orders, input));
  const cards: WidgetCardView[] = shown.map((o) => ({
    orderId: o.orderId,
    pickupNumber: o.pickupNumber,
    status: o.status as WidgetCardView["status"],
    paidAt: o.paidAt,
    arrivalAt: o.arrivalAt,
    note: o.note,
    items: o.items.map(({ name, quantity }) => ({ name, quantity })),
    busy: !!input.inFlight[o.orderId],
    ...(input.unprinted?.has(o.orderId) ? { unprinted: true as const } : {}),
    failure: input.failures[o.orderId],
    undoExpiresAt: input.lingering.get(o.orderId),
  }));
  return {
    visible: input.shown && (cards.length > 0 || input.autoOffCard),
    autoOffCard: input.autoOffCard,
    cards,
    moreCount,
  };
}

/** 메뉴는 2줄까지 보이고 넘으면 「+ 외 N개」 (3.3). N은 남은 메뉴 종류 수. */
export const WIDGET_MENU_LINES = 2;
export function widgetMenu<T>(items: readonly T[]): {
  shown: T[];
  moreCount: number;
} {
  return limitCards(items, WIDGET_MENU_LINES);
}

/** 카드 사이 간격(px)과 「+ N건」 줄이 차지하는 높이(버튼 44 + 간격 8). 위젯 화면의 Tailwind 값과 맞춰야 한다. */
export const WIDGET_GAP = 8;
export const WIDGET_MORE_ROW = 52;

/**
 * 화면 높이(max)에 들어가는 카드 수 (스펙 3.3 "화면 높이에 들어가는 만큼"). 못 그린 카드는 「+ N건」에 더해진다.
 * heights는 지금 그려진 카드들의 높이, boxHeight는 위젯 전체 높이, moreShown은 「+ N건」 줄이 이미 그려져 있는지.
 * 카드는 최소 1장은 보인다.
 */
export function fitCount(
  heights: readonly number[],
  boxHeight: number,
  max: number,
  moreShown: boolean,
): number {
  const n = heights.length;
  const base =
    boxHeight -
    heights.reduce((a, b) => a + b, 0) -
    n * WIDGET_GAP -
    (moreShown ? WIDGET_MORE_ROW : 0);
  let used = base;
  for (let k = 0; k < n; k += 1) {
    used += heights[k] + WIDGET_GAP;
    const needMore = moreShown || k + 1 < n;
    if (used + (needMore ? WIDGET_MORE_ROW : 0) > max) return Math.max(1, k);
  }
  return n;
}
