import { describe, expect, it } from "vitest";
import type { Order } from "../../shared/api/orders";
import {
  buildWidgetView,
  fitCount,
  hasPendingOrder,
  limitCards,
  pickWidgetOrders,
  widgetMenu,
} from "./widget-logic";

function order(id: string, status: Order["status"], paidAt: number): Order {
  return {
    orderId: id,
    orderNumber: "x",
    pickupNumber: Number(id.replace(/\D/g, "")) || 1,
    status,
    updatedAt: paidAt,
    paidAt,
    pickupChoice: "now",
    items: [{ name: "아메리카노(시험)", quantity: 1 }],
    customerName: "홍*동",
    phoneLast4: "1234",
    statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
  };
}
const none = {
  dismissed: new Set<string>(),
  lingering: new Map<string, number>(),
};
const ids = (list: Order[]) => list.map((o) => o.orderId);

describe("pickWidgetOrders", () => {
  it("접수대기가 먼저, 그 안에서 오래된 주문이 위다. 나머지도 오래된 순", () => {
    const list = [
      order("a", "ready", 1),
      order("b", "pending", 5),
      order("c", "preparing", 2),
      order("d", "pending", 3),
    ];
    expect(ids(pickWidgetOrders(list, none))).toEqual(["d", "b", "a", "c"]);
  });

  it("픽업완료 · 취소 주문은 보이지 않는다", () => {
    const list = [
      order("a", "picked-up", 1),
      order("b", "store-cancelled", 2),
      order("c", "customer-cancelled", 3),
    ];
    expect(pickWidgetOrders(list, none)).toEqual([]);
  });

  it("숨긴 카드는 빠지고, 보일 상태를 줄여도 접수대기는 늘 보인다", () => {
    const list = [order("a", "pending", 1), order("b", "ready", 2)];
    const out = pickWidgetOrders(list, {
      ...none,
      dismissed: new Set(["a", "b"]),
    });
    expect(out).toEqual([]);
    const only = pickWidgetOrders(list, {
      ...none,
      statuses: new Set(["preparing"]),
    });
    expect(ids(only)).toEqual(["a"]);
  });

  it("완료 취소 카드가 떠 있는 픽업완료 주문은 보인다", () => {
    const list = [order("a", "picked-up", 1)];
    const out = pickWidgetOrders(list, {
      ...none,
      lingering: new Map([["a", 9]]),
    });
    expect(ids(out)).toEqual(["a"]);
  });
});

describe("limitCards", () => {
  it("5장까지 보이고 나머지 건수를 센다", () => {
    const { shown, moreCount } = limitCards([1, 2, 3, 4, 5, 6, 7]);
    expect(shown).toEqual([1, 2, 3, 4, 5]);
    expect(moreCount).toBe(2);
    expect(limitCards([1, 2]).moreCount).toBe(0);
  });
});

describe("widgetMenu", () => {
  it("2줄까지 보이고 남은 종류 수를 센다", () => {
    expect(widgetMenu(["a", "b", "c", "d"])).toEqual({
      shown: ["a", "b"],
      moreCount: 2,
    });
  });
});

describe("hasPendingOrder", () => {
  it("접수대기가 하나라도 있으면 참", () => {
    expect(hasPendingOrder([order("a", "preparing", 1)])).toBe(false);
    expect(hasPendingOrder([order("a", "pending", 1)])).toBe(true);
  });
});

describe("buildWidgetView", () => {
  const base = {
    ...none,
    shown: true,
    autoOffCard: false,
    inFlight: {},
    failures: {},
  };
  it("띄운 상태에서 카드가 있으면 보인다", () => {
    const view = buildWidgetView([order("a", "pending", 1)], base);
    expect(view.visible).toBe(true);
    expect(view.cards).toHaveLength(1);
  });
  it("카드가 0장이면 숨긴다. 자동 OFF 카드만 있어도 보인다", () => {
    expect(buildWidgetView([], base).visible).toBe(false);
    expect(buildWidgetView([], { ...base, autoOffCard: true }).visible).toBe(
      true,
    );
  });
  it("띄우지 않은 상태면 카드가 있어도 숨긴다", () => {
    const view = buildWidgetView([order("a", "pending", 1)], {
      ...base,
      shown: false,
    });
    expect(view.visible).toBe(false);
  });
  it("요청 중 · 실패 문구 · 완료 취소 마감을 카드에 싣고, 고객 정보는 싣지 않는다", () => {
    const view = buildWidgetView(
      [order("a1", "pending", 1), order("b2", "picked-up", 2)],
      {
        ...base,
        inFlight: { a1: true },
        failures: { a1: "#1 실패" },
        lingering: new Map([["b2", 99]]),
      },
    );
    expect(view.cards[0]).toMatchObject({ busy: true, failure: "#1 실패" });
    expect(view.cards[1]).toMatchObject({
      status: "picked-up",
      undoExpiresAt: 99,
    });
    expect(JSON.stringify(view)).not.toContain("홍*동");
    expect(JSON.stringify(view)).not.toContain("1234");
  });
  it("5장을 넘으면 나머지 건수를 준다", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      order(`o${i}`, "pending", i),
    );
    const view = buildWidgetView(many, base);
    expect(view.cards).toHaveLength(5);
    expect(view.moreCount).toBe(2);
  });
});

describe("fitCount", () => {
  // 머리 40 + 위아래 여백 16 = 고정 56. 카드 250px + 간격 8.
  const heights = [250, 250, 250, 250, 250];
  const box = 56 + 5 * 258;
  it("화면에 다 들어가면 전부 보인다", () => {
    expect(fitCount(heights, box, 2000, false)).toBe(5);
  });
  it("1024×768(작업 영역 약 700 - 여백 32)에서는 「+ N건」 자리를 비우고 자른다", () => {
    expect(fitCount(heights, box, 668, false)).toBe(2);
  });
  it("아무리 좁아도 카드는 1장 보인다", () => {
    expect(fitCount(heights, box, 100, false)).toBe(1);
  });
  it("이미 「+ N건」 줄이 있으면 그 자리를 처음부터 뺀다", () => {
    const withMore = 56 + 5 * 258 + 52;
    expect(fitCount(heights, withMore, 668, true)).toBe(2);
  });
});
