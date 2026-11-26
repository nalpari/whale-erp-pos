import { describe, expect, it } from "vitest";
import { addDays, sameDayLastMonth, startOfDay } from "../date-days";
import {
  createMockOrderHistoryApi,
  PAGE_SIZES,
  toHistoryOrder,
} from "./order-history";
import { isCancelledStatus, type Order, type OrderStatus } from "./orders";

const NOW = new Date(2026, 10, 19, 15, 0).getTime();
const today = startOfDay(NOW);
const api = createMockOrderHistoryApi({
  todayOrders: () => [],
  delayMs: 0,
  now: () => NOW,
});
const month = { fromDay: sameDayLastMonth(today), toDay: today };

describe("모의 주문내역 서버", () => {
  it("탭 건수는 전체 = 나머지 합이고, 지난 날에는 처리 중 주문이 없다", async () => {
    const { counts } = await api.fetchPage({
      ...month,
      tab: "all",
      q: "",
      page: 1,
      size: 100,
    });
    expect(counts.all).toBe(
      counts.pending +
        counts.preparing +
        counts.ready +
        counts["picked-up"] +
        counts.cancelled,
    );
    expect(counts.pending + counts.preparing + counts.ready).toBe(0);
    expect(counts.cancelled).toBeGreaterThan(0);
  });

  it("쪽마다 건수만큼 자르고, 합계는 취소를 뺀 결제금액이다", async () => {
    // 한 쪽(100건)에 다 담기는 최근 일주일로 합계를 직접 더해 비교한다
    const q = {
      fromDay: addDays(today, -7),
      toDay: today,
      tab: "all" as const,
      q: "",
      page: 1,
    };
    const all = await api.fetchPage({ ...q, size: PAGE_SIZES[2] });
    const page1 = await api.fetchPage({ ...q, size: PAGE_SIZES[0] });
    expect(page1.rows).toHaveLength(20);
    expect(page1.rows[0]).toEqual(all.rows[0]);
    const cancelled = await api.fetchPage({
      ...q,
      tab: "cancelled",
      size: 100,
    });
    const sum = (rows: { paidAmount: number }[]) =>
      rows.reduce((s, r) => s + r.paidAmount, 0);
    const isCancel = (r: { status: OrderStatus }) =>
      isCancelledStatus(r.status);
    // 전체 탭 합계는 취소를 뺀 결제금액, 취소 탭 합계는 취소 금액이다 (Q35)
    expect(all.summary.amount).toBe(sum(all.rows.filter((r) => !isCancel(r))));
    expect(cancelled.summary.amount).toBe(sum(cancelled.rows));
    expect(all.summary.excludedCancelCount).toBe(cancelled.counts.cancelled);
    expect(cancelled.summary.excludedCancelCount).toBe(0);
  });

  it("기간 밖 날짜(한 달 전보다 앞)는 결과에 없다", async () => {
    const { counts } = await api.fetchPage({
      fromDay: addDays(month.fromDay, -5),
      toDay: addDays(month.fromDay, -1),
      tab: "all",
      q: "",
      page: 1,
      size: 20,
    });
    expect(counts.all).toBe(0);
  });

  it("지난 날 모의 주문에 환불이 섞여 있고, 취소 탭에 들어가며 전체 합계에서 빠져 「취소 N건 제외」에 센다 (T22)", async () => {
    const q = { ...month, q: "", page: 1, size: 100 as const };
    const cancelled = await api.fetchPage({ ...q, tab: "cancelled" });
    const refunded = cancelled.rows.filter((r) => r.status === "refunded");
    expect(refunded.length).toBeGreaterThan(0);
    expect(cancelled.summary.amount).toBe(
      cancelled.rows.reduce((s, r) => s + r.paidAmount, 0),
    );
    const all = await api.fetchPage({ ...q, tab: "all" });
    expect(all.summary.excludedCancelCount).toBe(cancelled.counts.cancelled);
    // 환불 주문은 주문한 날(결제 시각)에 그대로 있고, 취소 정보에 환불 시각이 있다
    const detail = await api.fetchDetail(refunded[0].orderId);
    expect(detail.paidAt).toBe(refunded[0].paidAt);
    expect(detail.cancel?.refundedAt).toBeGreaterThan(detail.cancel!.at);
  });

  it("「N번째 주문」은 같은 고객의 앞선 주문 중 매장취소 · 고객취소 · 환불을 빼고 센다 (HST-08, T22)", async () => {
    const order = (n: number, status: OrderStatus): Order => ({
      orderId: `t-${n}`,
      orderNumber: `261119000001000${n}`,
      pickupNumber: n,
      status,
      updatedAt: today + n * 60_000,
      paidAt: today + n * 60_000,
      pickupChoice: "now",
      items: [{ name: "카페라떼(시험)", quantity: 1 }],
      customerName: "홍*동",
      phoneLast4: "0000",
      statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
    });
    const todays = [
      order(1, "picked-up"),
      order(2, "refunded"),
      order(3, "store-cancelled"),
      order(4, "customer-cancelled"),
      order(5, "ready"),
    ].map((o) => toHistoryOrder(o, null, []));
    const withToday = createMockOrderHistoryApi({
      todayOrders: () => todays,
      delayMs: 0,
      now: () => NOW,
    });
    expect((await withToday.fetchDetail("t-1")).orderCount).toBe(1);
    expect((await withToday.fetchDetail("t-5")).orderCount).toBe(2);
  });
});
