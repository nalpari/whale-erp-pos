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
  arrivalAt: PAID + 20 * 60_000,
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

const texts = (
  order: OrderFormInput,
  options?: Parameters<typeof buildOrderLines>[1],
) => buildOrderLines(order, options).map((l) => (l.rule ? "---" : l.text));

describe("주문서 줄 목록", () => {
  it("스펙 3.1 순서: 제목 · 픽업번호 · 정보 · 메뉴", () => {
    expect(texts(ORDER)).toEqual([
      "픽업오더 주문서 (주방 / 바리스타용)",
      "#108",
      "---",
      "주문번호: 2611190000010108",
      "주문일시: 2026-11-19 09:30",
      "주문자: 박*준 (1234)",
      "도착예정: 09:50",
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

  it("재제조면 맨 위에 「[재제조] HH:mm」 · 「사유: …」, 「[재출력]」은 찍지 않는다 (print-forms 13장)", () => {
    const at = new Date(2026, 10, 19, 14, 5).getTime();
    const lines = buildOrderLines(ORDER, {
      reprintAt: at,
      remake: { at, reason: "이물질", items: [{ itemIndex: 1, quantity: 1 }] },
    });
    expect(lines.slice(0, 3).map((l) => l.text)).toEqual([
      "[재제조] 14:05",
      "사유: 이물질",
      "픽업오더 주문서 (주방 / 바리스타용)",
    ]);
    expect(lines[0]).toMatchObject({ bold: true });
    // 고른 메뉴만: 아이스 아메리카노는 빠진다
    expect(
      lines.filter((l) => l.text?.includes(" × ")).map((l) => l.text),
    ).toEqual(["치즈 케이크 × 1"]);
    expect(lines.some((l) => l.text?.includes("재출력"))).toBe(false);
  });

  it("재제조 주문서는 고른 수량을 찍고 옵션 줄은 그대로다", () => {
    const at = new Date(2026, 10, 19, 14, 5).getTime();
    const t = texts(ORDER, {
      remake: { at, reason: "이물질", items: [{ itemIndex: 0, quantity: 1 }] },
    });
    expect(t.slice(-3)).toEqual([
      "아이스 아메리카노 × 1",
      "ㄴ 샷 추가",
      "ㄴ 시럽 빼기",
    ]);
    expect(t).not.toContain("치즈 케이크 × 1");
  });

  it("주문자는 가린 이름 + 끝 4자리", () => {
    expect(customerLabel(ORDER)).toBe("박*준 (1234)");
  });
});
