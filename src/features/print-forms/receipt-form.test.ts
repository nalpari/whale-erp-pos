import { describe, expect, it } from "vitest";
import type {
  HistoryOrder,
  ReceiptStore,
} from "../../shared/api/order-history";
import { buildReceiptLines, money } from "./receipt-form";

const STORE: ReceiptStore = {
  name: "웨일커피 시험점",
  phone: "02-000-0000",
  address: "서울 시험구",
  representative: "김시험",
  businessNumber: "000-00-00000",
};
const PAID = new Date(2026, 10, 19, 9, 30).getTime();

function order(
  overrides: Partial<HistoryOrder["payment"]> = {},
  status: HistoryOrder["status"] = "picked-up",
): HistoryOrder {
  return {
    orderId: "o1",
    orderNumber: "2611190000010108",
    pickupNumber: 108,
    status,
    updatedAt: PAID,
    paidAt: PAID,
    pickupChoice: "now",
    customerName: "박*준",
    phoneLast4: "1234",
    statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
    items: [
      {
        name: "아메리카노",
        quantity: 2,
        unitPrice: 4500,
        options: [
          { name: "샷 추가", price: 500 },
          { name: "얼음 적게", price: 0 },
        ],
      },
    ],
    payment: {
      orderAmount: 10000,
      discounts: [{ kind: "coupon", amount: 1000 }],
      paidAmount: 9000,
      method: "신용카드",
      taxableAmount: 8182,
      vat: 818,
      approvalNumber: "30001234",
      approvedAt: PAID,
      card: {
        maskedNumber: "4000-12**-****-1234",
        kind: "신용",
        division: "일시불",
        acquirer: "시험카드",
      },
      transactionId: "TX1",
      ...overrides,
    },
    cancel: null,
    orderCount: 1,
    remakes: [],
  };
}

/** 줄을 「왼쪽 | 오른쪽」 글자로 풀어 비교하기 쉽게 한다. */
function rows(o: HistoryOrder) {
  return buildReceiptLines(o, STORE).map((l) =>
    l.rule
      ? "---"
      : l.right !== undefined
        ? `${l.text} | ${l.right}`
        : (l.text ?? ""),
  );
}

describe("money", () => {
  it("쉼표를 찍고, 취소면 마이너스, 0은 부호 없음", () => {
    expect(money(1234567, false)).toBe("1,234,567");
    expect(money(4500, true)).toBe("-4,500");
    expect(money(0, true)).toBe("0");
  });
});

describe("영수증 줄 목록", () => {
  it("카드 결제: 점포 · 메뉴 · 금액 · 카드 정보를 스펙 4.2 순서로", () => {
    expect(rows(order())).toEqual([
      "영수증",
      "---",
      "웨일커피 시험점",
      "전화번호: 02-000-0000",
      "주소: 서울 시험구",
      "대표자: 김시험",
      "사업자번호: 000-00-00000",
      "판매일자: 2026-11-19 09:30",
      "주문번호: 2611190000010108",
      "---",
      "아메리카노 × 2 | 9,000",
      "ㄴ 샷 추가 | 1,000",
      "ㄴ 얼음 적게",
      "---",
      "주문금액 | 10,000",
      "쿠폰 할인 | 1,000",
      "결제금액 | 9,000",
      "과세금액 | 8,182",
      "부가세 | 818",
      "---",
      "카드번호 | 4000-12**-****-1234",
      "거래종류 | 신용",
      "거래구분 | 일시불",
      "승인번호 | 30001234",
      "승인일시 | 2026-11-19 09:30",
      "매입사명 | 시험카드",
    ]);
  });

  it("간편결제: 카드 줄 없이 결제수단 · 승인번호 · 승인일시만", () => {
    const out = rows(order({ card: null, method: "카카오페이" }));
    const tail = out.slice(out.indexOf("부가세 | 818") + 2);
    expect(tail).toEqual([
      "결제수단 | 카카오페이",
      "승인번호 | 30001234",
      "승인일시 | 2026-11-19 09:30",
    ]);
    expect(out.join("\n")).not.toContain("카드번호");
  });

  it("전액 할인: 결제 줄 대신 「결제 금액 0원」과 할인 내역만", () => {
    const out = rows(
      order({
        discounts: [{ kind: "point", amount: 10000 }],
        paidAmount: 0,
        taxableAmount: 0,
        vat: 0,
        approvalNumber: null,
        approvedAt: null,
        card: null,
        method: "포인트 결제",
      }),
    );
    expect(out).toContain("포인트 할인 | 10,000");
    // 「결제금액」 줄 없이 「결제 금액 0원」만 (사용자 결정 2026-11-19).
    expect(out.some((row) => row.startsWith("결제금액"))).toBe(false);
    expect(out[out.length - 1]).toBe("결제 금액 0원");
    expect(out.join("\n")).not.toMatch(/승인|카드|결제수단/);
  });

  it("취소 · 환불 주문: 제목 「취소 영수증」, 금액은 모두 마이너스 (T22)", () => {
    for (const status of [
      "store-cancelled",
      "customer-cancelled",
      "refunded",
    ] as const) {
      const out = rows(order({}, status));
      expect(out[0]).toBe("취소 영수증");
      expect(out).toContain("아메리카노 × 2 | -9,000");
      expect(out).toContain("주문금액 | -10,000");
      expect(out).toContain("쿠폰 할인 | -1,000");
      expect(out).toContain("결제금액 | -9,000");
      expect(out).toContain("과세금액 | -8,182");
      expect(out).toContain("부가세 | -818");
    }
  });

  it("과세금액 · 부가세는 서버 값 그대로(앱이 계산하지 않음)", () => {
    const out = rows(order({ taxableAmount: 1, vat: 2 }));
    expect(out).toContain("과세금액 | 1");
    expect(out).toContain("부가세 | 2");
  });
});
