import { describe, expect, it } from "vitest";
import type { Order, OrderStatus, PickupChoice } from "../../shared/api/orders";
import {
  countByStatus,
  formatClock,
  menuSummary,
  pickupSchedule,
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
    pickupChoice: "now",
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

describe("pickupSchedule (Q26, 결제 15:25)", () => {
  const at = (choice: PickupChoice, afterMin: number, afterSec = 0) =>
    pickupSchedule(
      order("a", { pickupChoice: choice }),
      PAID + afterMin * MIN + afterSec * 1000,
    );

  it("지금: 방금 결제했으면 「지금 픽업」만", () => {
    expect(at("now", 0, 30)).toEqual({ label: "지금 픽업" });
  });
  it("지금: 시간이 지나면 지난 분이 빨간 글자로 붙는다", () => {
    expect(at("now", 3, 10)).toEqual({
      label: "지금 픽업",
      note: { text: "3분 지남", overdue: true },
    });
  });
  it("5~40분: 예정 시각과 남은 분이 보이고 1분마다 줄어든다", () => {
    expect(at("20min", 0)).toEqual({
      label: "15:45 픽업",
      note: { text: "20분 뒤", overdue: false },
    });
    expect(at("20min", 1, 10).note?.text).toBe("19분 뒤");
    expect(at("5min", 0).label).toBe("15:30 픽업");
    expect(at("40min", 0).label).toBe("16:05 픽업");
  });
  it("5~40분: 예정 시각을 지난 지 1분이 안 됐으면 괄호가 없다", () => {
    expect(at("20min", 20, 30)).toEqual({ label: "15:45 픽업" });
  });
  it("모르는 값이 와도 NaN 대신 「지금 픽업」으로 본다", () => {
    const o = order("a", { pickupChoice: "7min" as PickupChoice });
    expect(pickupSchedule(o, PAID)).toEqual({ label: "지금 픽업" });
  });
  it("1시간 이상: 결제 시각 + 1시간, 괄호는 「1시간 이상」", () => {
    expect(at("1hour-plus", 0)).toEqual({
      label: "16:25 픽업",
      note: { text: "1시간 이상", overdue: false },
    });
    expect(at("1hour-plus", 30).note?.text).toBe("1시간 이상");
  });
  it("예정 시각이 지나면 괄호 안이 빨간 「N분 지남」", () => {
    expect(at("20min", 23, 30)).toEqual({
      label: "15:45 픽업",
      note: { text: "3분 지남", overdue: true },
    });
    expect(at("1hour-plus", 65).note).toEqual({
      text: "5분 지남",
      overdue: true,
    });
  });
});

describe("showAutoCancelWarning (Q20)", () => {
  it("접수대기가 결제 뒤 12분부터 보인다", () => {
    const o = order("a");
    expect(showAutoCancelWarning(o, PAID + 11 * MIN + 59_000)).toBe(false);
    expect(showAutoCancelWarning(o, PAID + 12 * MIN)).toBe(true);
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
  ];

  it("첫 탭은 처리할 주문만, 최신순이 기본이다. 취소 · 픽업완료는 없다", () => {
    const { board } = splitOrders(orders, base);
    expect(board.map((o) => o.orderId)).toEqual(["p2", "p3", "p1"]);
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
