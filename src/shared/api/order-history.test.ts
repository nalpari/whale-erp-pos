import { describe, expect, it } from "vitest";
import { addDays, sameDayLastMonth, startOfDay } from "../date-days";
import { createMockOrderHistoryApi, PAGE_SIZES } from "./order-history";

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
    const isCancel = (r: { status: string }) => r.status.endsWith("cancelled");
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
});
