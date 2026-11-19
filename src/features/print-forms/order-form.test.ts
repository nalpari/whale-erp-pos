import { describe, expect, it } from "vitest";
import {
  buildOrderLines,
  customerLabel,
  type OrderFormInput,
} from "./order-form";

const PAID = new Date(2026, 10, 19, 9, 30).getTime();

const ORDER: OrderFormInput = {
  pickupNumber: 108,
  orderNumber: "2611190000010108",
  paidAt: PAID,
  pickupChoice: "20min",
  customerName: "박*준",
  phoneLast4: "1234",
  items: [
    {
      name: "아이스 아메리카노",
      quantity: 2,
      options: ["샷 추가", "시럽 빼기"],
    },
    { name: "치즈 케이크", quantity: 1 },
  ],
};

const texts = (order: OrderFormInput, options?: { reprintAt?: number }) =>
  buildOrderLines(order, options).map((l) => (l.rule ? "---" : l.text));

describe("주문서 줄 목록", () => {
  it("스펙 3.1 순서: 제목 · 픽업번호 · 정보 · 메뉴", () => {
    expect(texts(ORDER)).toEqual([
      "픽업오더 주문서 (주방 / 바리스타용)",
      "#108",
      "---",
      "주문번호: 2611190000010108",
      "주문일시: 2026-11-19 09:30",
      "주문자: 박*준 (1234)",
      "픽업예정: 09:50",
      "---",
      "아이스 아메리카노 × 2",
      "ㄴ 샷 추가",
      "ㄴ 시럽 빼기",
      "---",
      "치즈 케이크 × 1",
    ]);
  });

  it("픽업번호는 가장 크고 굵게", () => {
    const [, number] = buildOrderLines(ORDER);
    expect(number).toMatchObject({ text: "#108", bold: true, align: "center" });
    expect(number.size).toBeGreaterThan(20);
  });

  it("지금 픽업이면 「지금」", () => {
    expect(texts({ ...ORDER, pickupChoice: "now" })).toContain(
      "픽업예정: 지금",
    );
  });

  it("요청사항이 있으면 굵게, 없으면 줄이 없다", () => {
    const withNote = buildOrderLines({ ...ORDER, note: "얼음 적게" });
    const note = withNote.find((l) => l.text?.startsWith("요청사항"));
    expect(note).toMatchObject({ text: "요청사항: 얼음 적게", bold: true });
    expect(texts(ORDER).some((t) => t?.startsWith("요청사항"))).toBe(false);
  });

  it("재출력이면 맨 위에 「[재출력] HH:mm」", () => {
    const reprintAt = new Date(2026, 10, 19, 14, 5).getTime();
    expect(texts(ORDER, { reprintAt })[0]).toBe("[재출력] 14:05");
    expect(texts(ORDER)[0]).not.toContain("재출력");
  });

  it("주문자는 가린 이름 + 끝 4자리", () => {
    expect(customerLabel(ORDER)).toBe("박*준 (1234)");
  });
});
