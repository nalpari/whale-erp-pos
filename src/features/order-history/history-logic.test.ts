import { describe, expect, it } from "vitest";
import type { HistoryOrder } from "../../shared/api/order-history";
import {
  formatPeriod,
  formatWon,
  isSelectableDay,
  menuLine,
  monthGrid,
  normalizeQuery,
  orderCountLabel,
  historyEntries,
  lineTotal,
  pageCount,
  pageWindow,
  pickDay,
  presets,
  shiftPeriod,
  summaryLine,
} from "./history-logic";

const day = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d).getTime();
// 2026-11-19 오후 3시 (시각이 있어도 0시로 맞춰 계산하는지 본다)
const NOW = new Date(2026, 10, 19, 15, 0).getTime();

describe("바로가기 기간", () => {
  it("오늘 · 어제 · 이번 달 · 최근 한 달", () => {
    const p = presets(NOW);
    expect(p.today).toEqual({ from: day(2026, 11, 19), to: day(2026, 11, 19) });
    expect(p.yesterday).toEqual({
      from: day(2026, 11, 18),
      to: day(2026, 11, 18),
    });
    expect(p["this-month"]).toEqual({
      from: day(2026, 11, 1),
      to: day(2026, 11, 19),
    });
    expect(p["last-month"]).toEqual({
      from: day(2026, 10, 19),
      to: day(2026, 11, 19),
    });
  });

  it("한 달 전 같은 날이 없으면 그 달 마지막 날 (3/31 → 2/28, 윤년 3/31 → 2/29)", () => {
    expect(presets(day(2027, 3, 31))["last-month"].from).toBe(day(2027, 2, 28));
    expect(presets(day(2028, 3, 31))["last-month"].from).toBe(day(2028, 2, 29));
  });

  it("1월이면 지난해 12월", () => {
    expect(presets(day(2027, 1, 15))["last-month"].from).toBe(
      day(2026, 12, 15),
    );
  });
});

describe("< > 이동", () => {
  it("하루면 하루씩 옮긴다", () => {
    const today = { from: day(2026, 11, 19), to: day(2026, 11, 19) };
    expect(shiftPeriod(today, -1, NOW)).toEqual({
      from: day(2026, 11, 18),
      to: day(2026, 11, 18),
    });
  });

  it("기간 길이만큼 옮긴다", () => {
    const p = { from: day(2026, 11, 10), to: day(2026, 11, 12) };
    expect(shiftPeriod(p, -1, NOW)).toEqual({
      from: day(2026, 11, 7),
      to: day(2026, 11, 9),
    });
    expect(shiftPeriod(p, 1, NOW)).toEqual({
      from: day(2026, 11, 13),
      to: day(2026, 11, 15),
    });
  });

  it("오늘을 넘는 쪽은 막는다", () => {
    const today = { from: day(2026, 11, 19), to: day(2026, 11, 19) };
    expect(shiftPeriod(today, 1, NOW)).toBeNull();
  });

  it("한 달 전을 넘는 쪽은 막는다", () => {
    const first = { from: day(2026, 10, 19), to: day(2026, 10, 19) };
    expect(shiftPeriod(first, -1, NOW)).toBeNull();
    // 일부만 벗어나도 막는다
    const p = { from: day(2026, 10, 20), to: day(2026, 10, 22) };
    expect(shiftPeriod(p, -1, NOW)).toBeNull();
  });

  it("최근 한 달은 양쪽 모두 막힌다", () => {
    expect(shiftPeriod(presets(NOW)["last-month"], -1, NOW)).toBeNull();
    expect(shiftPeriod(presets(NOW)["last-month"], 1, NOW)).toBeNull();
  });
});

describe("달력", () => {
  it("한 달 전 같은 날부터 오늘까지만 고를 수 있다", () => {
    expect(isSelectableDay(day(2026, 10, 19), NOW)).toBe(true);
    expect(isSelectableDay(day(2026, 11, 19), NOW)).toBe(true);
    expect(isSelectableDay(day(2026, 10, 18), NOW)).toBe(false);
    expect(isSelectableDay(day(2026, 11, 20), NOW)).toBe(false);
  });

  it("하루를 두 번 누르면 하루, 두 날을 누르면 기간(순서가 뒤바뀌어도)", () => {
    const first = pickDay(null, false, day(2026, 11, 10));
    expect(first).toEqual({
      selection: { from: day(2026, 11, 10), to: day(2026, 11, 10) },
      pickingEnd: true,
    });
    expect(pickDay(first.selection, true, day(2026, 11, 10)).selection).toEqual(
      { from: day(2026, 11, 10), to: day(2026, 11, 10) },
    );
    const second = pickDay(first.selection, true, day(2026, 11, 5));
    expect(second.selection).toEqual({
      from: day(2026, 11, 5),
      to: day(2026, 11, 10),
    });
    expect(second.pickingEnd).toBe(false);
    // 끝난 뒤 누르면 새로 시작
    expect(
      pickDay(second.selection, false, day(2026, 11, 1)).selection,
    ).toEqual({ from: day(2026, 11, 1), to: day(2026, 11, 1) });
  });

  it("월 격자: 첫 주 앞은 빈 칸, 2월은 28일(윤년 29일)", () => {
    const flat = (y: number, m: number) => monthGrid(y, m).flat();
    expect(flat(2027, 2).filter((d) => d !== null)).toHaveLength(28);
    expect(flat(2028, 2).filter((d) => d !== null)).toHaveLength(29);
    // 2026-11-01은 일요일 → 앞 빈 칸 없음, 2026-10-01은 목요일 → 앞 4칸
    expect(monthGrid(2026, 11)[0][0]).toBe(day(2026, 11, 1));
    expect(monthGrid(2026, 10)[0].slice(0, 4)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(monthGrid(2026, 10)[0][4]).toBe(day(2026, 10, 1));
    expect(monthGrid(2026, 10).every((w) => w.length === 7)).toBe(true);
  });
});

describe("문구", () => {
  it("기간 표시", () => {
    expect(
      formatPeriod({ from: day(2026, 11, 19), to: day(2026, 11, 19) }),
    ).toBe("11.19");
    expect(
      formatPeriod({ from: day(2026, 11, 1), to: day(2026, 11, 19) }),
    ).toBe("11.01 ~ 11.19");
  });

  it("메뉴: 하나면 그대로, 여럿이면 첫 메뉴 + 외 N개(종류 수)", () => {
    expect(menuLine(["아메리카노"])).toBe("아메리카노");
    expect(menuLine(["아메리카노", "라떼", "케이크"])).toBe(
      "아메리카노 외 2개",
    );
  });

  it("금액", () => {
    expect(formatWon(26100)).toBe("₩26,100");
    expect(formatWon(0)).toBe("₩0");
    expect(formatWon(1234567)).toBe("₩1,234,567");
  });

  it("N번째 주문 · 첫 주문", () => {
    expect(orderCountLabel(1)).toBe("첫 주문");
    expect(orderCountLabel(3)).toBe("3번째 주문");
  });

  it("요약 줄 3가지", () => {
    const counts = {
      all: 9,
      pending: 1,
      preparing: 2,
      ready: 0,
      "picked-up": 5,
      cancelled: 1,
    };
    expect(
      summaryLine("all", counts, { amount: 26100, excludedCancelCount: 1 }),
    ).toBe("총 9건 · 결제 합계 ₩26,100 (취소 1건 제외)");
    expect(
      summaryLine("cancelled", counts, {
        amount: 8000,
        excludedCancelCount: 0,
      }),
    ).toBe("총 1건 · 취소 금액 ₩8,000");
    expect(
      summaryLine("preparing", counts, {
        amount: 9000,
        excludedCancelCount: 0,
      }),
    ).toBe("총 2건 · 결제 합계 ₩9,000");
  });
});

describe("검색어 · 페이지", () => {
  it("앞뒤 공백과 #을 떼고, 숫자 아닌 글자는 거른다", () => {
    expect(normalizeQuery(" #343 ")).toBe("343");
    expect(normalizeQuery("343")).toBe("343");
    expect(normalizeQuery("12ab34")).toBe("1234");
    expect(normalizeQuery("   ")).toBe("");
  });

  it("페이지 수는 올림, 결과가 없어도 1", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });
});

describe("페이지 번호", () => {
  it("현재 둘레 5개, 끝에 닿으면 채운다", () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(1, 2)).toEqual([1, 2]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});

const last = <T>(list: T[]): T | undefined => list[list.length - 1];

const base = {
  paidAt: 100,
  statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
  cancel: null,
} as unknown as HistoryOrder;

describe("메뉴 금액 · 처리 이력", () => {
  it("한 줄 금액은 (단가 + 옵션) × 수량", () => {
    expect(
      lineTotal({
        name: "a",
        quantity: 2,
        unitPrice: 4500,
        options: [{ name: "샷 추가", price: 500 }],
      }),
    ).toBe(10000);
  });

  it("시각이 있는 단계만, 순서대로", () => {
    const e = historyEntries({
      ...base,
      statusTimes: { preparingAt: 200, readyAt: 300, pickedUpAt: null },
    });
    expect(e.map((x) => x.label)).toEqual(["결제(주문)", "제조중", "제조완료"]);
  });

  it("취소면 취소 시각 · 누가 · 사유가 붙는다", () => {
    const store = historyEntries({
      ...base,
      cancel: { at: 150, by: "store", reason: "재료가 소진되었습니다" },
    });
    expect(store[store.length - 1]).toEqual({
      label: "매장취소",
      at: 150,
      note: "재료가 소진되었습니다",
    });
    expect(
      last(
        historyEntries({
          ...base,
          cancel: { at: 150, by: "customer", reason: null },
        }),
      )?.label,
    ).toBe("고객취소");
    expect(
      last(
        historyEntries({
          ...base,
          cancel: { at: 150, by: "auto", reason: null },
        }),
      )?.label,
    ).toBe("자동 취소");
  });
});
