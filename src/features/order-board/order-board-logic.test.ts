import { describe, expect, it } from "vitest";
import type { Order, OrderStatus } from "../../shared/api/orders";
import {
  countByStatus,
  formatClock,
  menuSummary,
  arrivalSchedule,
  showAutoCancelWarning,
  splitOrders,
  startOfDay,
} from "./order-board-logic";

const MIN = 60_000;
// 2026-11-18 15:25 (PC 시간대 기준). 시간대에 상관없이 같은 모양으로 시험하려고 로컬 시각으로 만든다.
const PAID = new Date(2026, 10, 18, 15, 25, 0).getTime();

function order(
  id: string,
  over: Partial<Order> & { status?: OrderStatus } = {},
): Order {
  return {
    orderId: id,
    orderNumber: "2611180000010001",
    pickupNumber: 1,
    status: "pending",
    updatedAt: PAID,
    paidAt: PAID,
    autoCancelAt: PAID + 15 * MIN,
    arrivalAt: PAID + 20 * MIN,
    items: [{ name: "아메리카노", quantity: 1 }],
    customerName: "홍*동",
    phoneLast4: "0000",
    statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
    ...over,
  };
}

describe("formatClock", () => {
  it("시:분을 두 자리로 쓴다", () => {
    expect(formatClock(new Date(2026, 10, 18, 9, 5).getTime())).toBe("09:05");
  });
});

describe("menuSummary (Q24)", () => {
  const items = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `메뉴${i}`, quantity: 1 }));
  it("3개까지는 그대로 보이고 더 있다는 말이 없다", () => {
    expect(menuSummary(items(3))).toEqual({ shown: items(3), moreCount: 0 });
  });
  it("넘으면 3개만 보이고 남은 메뉴 종류 수를 센다 (5가지면 외 2개)", () => {
    const s = menuSummary(items(5));
    expect(s.shown).toHaveLength(3);
    expect(s.moreCount).toBe(2);
  });
  it("수량이 아니라 종류 수로 센다", () => {
    const many = [...items(3), { name: "쿠키", quantity: 9 }];
    expect(menuSummary(many).moreCount).toBe(1);
  });
});

describe("arrivalSchedule (12장, 15:25 결제 · 20분 고름 → 15:45 도착)", () => {
  const at = (afterMin: number, afterSec = 0) =>
    arrivalSchedule(order("a"), PAID + afterMin * MIN + afterSec * 1000);

  it("도착 전: 「HH:mm 도착 (N분 뒤)」, 1분마다 줄어든다", () => {
    expect(at(0)).toEqual({
      label: "15:45 도착",
      note: { text: "20분 뒤", overdue: false },
    });
    expect(at(1, 10).note?.text).toBe("19분 뒤");
  });
  it("남은 시간이 1분 미만이면 올려서 「1분 뒤」(0분 뒤는 없다)", () => {
    expect(at(19, 1).note?.text).toBe("1분 뒤");
    expect(at(19, 59).note?.text).toBe("1분 뒤");
  });
  it("도착 시각 정각부터 1분 전까지는 괄호가 없다", () => {
    expect(at(20)).toEqual({ label: "15:45 도착" });
    expect(at(20, 59)).toEqual({ label: "15:45 도착" });
  });
  it("도착 시각이 지나면 괄호 안이 빨간 「N분 지남」(내림)", () => {
    expect(at(21)).toEqual({
      label: "15:45 도착",
      note: { text: "1분 지남", overdue: true },
    });
    expect(at(23, 30).note).toEqual({ text: "3분 지남", overdue: true });
  });
  it("59분까지는 「N분 지남」, 60분부터 빨간 「1시간 이상 지남」", () => {
    expect(at(79, 59).note).toEqual({ text: "59분 지남", overdue: true });
    expect(at(80).note).toEqual({ text: "1시간 이상 지남", overdue: true });
    expect(at(20 + 710).note).toEqual({
      text: "1시간 이상 지남",
      overdue: true,
    });
  });
  it("「N분 뒤」는 60분이 넘어도 그대로 센다", () => {
    const far = order("a", { arrivalAt: PAID + 90 * MIN });
    expect(arrivalSchedule(far, PAID).note?.text).toBe("90분 뒤");
  });
});

describe("arrivalSchedule 분 기준 (12장 A-1, 도착 15:47:30 → 보이는 시각 15:47)", () => {
  const ARRIVAL = new Date(2026, 10, 18, 15, 47, 30).getTime();
  const at = (m: number, s: number) =>
    arrivalSchedule(
      order("a", { arrivalAt: ARRIVAL }),
      new Date(2026, 10, 18, 15, m, s).getTime(),
    );

  it("15:46:00~15:46:59는 「1분 뒤」", () => {
    expect(at(46, 0).note).toEqual({ text: "1분 뒤", overdue: false });
    expect(at(46, 59).note).toEqual({ text: "1분 뒤", overdue: false });
  });
  it("15:45:59는 「2분 뒤」", () => {
    expect(at(45, 59).note?.text).toBe("2분 뒤");
  });
  it("15:47:00~15:47:59는 괄호 없음 (초가 도착 시각보다 앞이든 뒤든)", () => {
    expect(at(47, 0)).toEqual({ label: "15:47 도착" });
    expect(at(47, 30)).toEqual({ label: "15:47 도착" });
    expect(at(47, 59)).toEqual({ label: "15:47 도착" });
  });
  it("15:48:00부터 「1분 지남」", () => {
    expect(at(48, 0).note).toEqual({ text: "1분 지남", overdue: true });
  });
});

describe("showAutoCancelWarning (SPEC-settings-order 5장)", () => {
  it.each([
    [15, 12],
    [5, 2],
    [30, 27],
  ])("자동 취소 %i분이면 결제 뒤 %i분부터 보인다", (cancelMin, warnMin) => {
    const o = order("a", { autoCancelAt: PAID + cancelMin * MIN });
    expect(showAutoCancelWarning(o, PAID + warnMin * MIN - 1)).toBe(false);
    expect(showAutoCancelWarning(o, PAID + warnMin * MIN)).toBe(true);
  });
  it("접수대기가 아니면 오래돼도 보이지 않는다", () => {
    expect(
      showAutoCancelWarning(
        order("a", { status: "preparing" }),
        PAID + 14 * MIN,
      ),
    ).toBe(false);
  });
});

describe("startOfDay", () => {
  it("PC 시계 0시를 돌려준다", () => {
    expect(startOfDay(PAID)).toBe(new Date(2026, 10, 18).getTime());
  });
});

describe("splitOrders (Q01 · Q17 · Q19 · Q21)", () => {
  const NOW = PAID + 30 * MIN;
  const all = { pending: true, preparing: true, ready: true };
  const base = {
    sort: "newest" as const,
    filters: all,
    now: NOW,
    lingering: new Set<string>(),
  };
  const orders = [
    order("p1", { paidAt: PAID + 1 * MIN }),
    order("p2", { status: "preparing", paidAt: PAID + 3 * MIN }),
    order("p3", { status: "ready", paidAt: PAID + 2 * MIN }),
    order("done-today", { status: "picked-up", updatedAt: NOW }),
    order("done-yesterday", {
      status: "picked-up",
      paidAt: startOfDay(NOW) - 1,
      updatedAt: NOW,
    }),
    order("c1", { status: "customer-cancelled" }),
    order("c2", { status: "store-cancelled" }),
    order("r1", { status: "refunded", updatedAt: NOW }),
  ];

  it("첫 탭은 처리할 주문만, 최신순이 기본이다. 취소 · 환불 · 픽업완료는 없다", () => {
    const { board, pickedUp } = splitOrders(orders, base);
    expect(board.map((o) => o.orderId)).toEqual(["p2", "p3", "p1"]);
    expect(pickedUp.map((o) => o.orderId)).not.toContain("r1"); // 환불은 픽업완료 탭에도 없다 (T22)
  });
  it("5초 배너 동안 환불로 바뀌어도 첫 탭에 남지 않는다 (T22)", () => {
    const { board } = splitOrders(orders, {
      ...base,
      lingering: new Set(["r1"]),
    });
    expect(board.map((o) => o.orderId)).not.toContain("r1");
  });
  it("5초 배너 동안 취소된 주문은 첫 탭에 남지 않는다 (T18)", () => {
    const { board } = splitOrders(orders, {
      ...base,
      lingering: new Set(["c2", "done-today"]),
    });
    expect(board.map((o) => o.orderId)).toContain("done-today");
    expect(board.map((o) => o.orderId)).not.toContain("c2");
  });
  it("오래된순이면 거꾸로", () => {
    const { board } = splitOrders(orders, { ...base, sort: "oldest" });
    expect(board.map((o) => o.orderId)).toEqual(["p1", "p3", "p2"]);
  });
  it("같은 시각이면 orderId 순으로 안정적으로 정렬한다", () => {
    const same = [order("b"), order("a")];
    expect(
      splitOrders(same, { ...base, sort: "oldest" }).board.map(
        (o) => o.orderId,
      ),
    ).toEqual(["a", "b"]);
  });
  it("0시에 서버가 자동 픽업완료한 어제 주문은 안 보이고, 오늘 결제해 픽업한 주문은 보인다", () => {
    const midnight = new Date(2026, 10, 19, 0, 0, 0).getTime();
    const list = [
      // 어제 23:50 결제, 00:00:05 픽업완료(서버 자동)
      order("yesterday-auto", {
        status: "picked-up",
        paidAt: midnight - 10 * MIN,
        updatedAt: midnight + 5000,
      }),
      // 오늘 00:30 결제, 00:50 픽업완료
      order("today", {
        status: "picked-up",
        paidAt: midnight + 30 * MIN,
        updatedAt: midnight + 50 * MIN,
      }),
    ];
    const { pickedUp } = splitOrders(list, {
      ...base,
      now: midnight + 60 * MIN,
    });
    expect(pickedUp.map((o) => o.orderId)).toEqual(["today"]);
  });
  it("픽업완료 탭은 오늘 것만, 최신순만", () => {
    const more = [
      ...orders,
      order("done-earlier-today", {
        status: "picked-up",
        paidAt: startOfDay(NOW) + 1,
        updatedAt: NOW,
      }),
    ];
    const { pickedUp } = splitOrders(more, { ...base, sort: "oldest" });
    expect(pickedUp.map((o) => o.orderId)).toEqual([
      "done-today",
      "done-earlier-today",
    ]);
  });
  it("체크를 푼 상태는 숨기지만 건수는 그대로다", () => {
    const filters = { pending: false, preparing: true, ready: false };
    const r = splitOrders(orders, { ...base, filters });
    expect(r.board.map((o) => o.orderId)).toEqual(["p2"]);
    expect(r.counts).toEqual({ pending: 1, preparing: 1, ready: 1 });
  });
  it("방금 픽업완료한 카드(5초 배너 중)는 필터와 상관없이 첫 탭에 남고 픽업완료 탭엔 없다", () => {
    const r = splitOrders(orders, {
      ...base,
      filters: { pending: false, preparing: false, ready: false },
      lingering: new Set(["done-today"]),
    });
    expect(r.board.map((o) => o.orderId)).toEqual(["done-today"]);
    expect(r.pickedUp.map((o) => o.orderId)).toEqual([]);
  });
});

describe("countByStatus", () => {
  it("세 상태만 센다", () => {
    expect(
      countByStatus([
        order("a"),
        order("b", { status: "ready" }),
        order("c", { status: "picked-up" }),
      ]),
    ).toEqual({ pending: 1, preparing: 0, ready: 1 });
  });
});
