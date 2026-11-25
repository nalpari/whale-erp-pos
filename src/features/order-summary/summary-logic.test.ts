import { describe, expect, it } from "vitest";
import type { Order, OrderStatus } from "../../shared/api/orders";
import {
  CANCEL_REASON_MAX,
  buildSteps,
  clampReason,
  countChars,
  formatDateTime,
  formatPhone,
  resolveReason,
  summaryButtons,
} from "./summary-logic";

describe("상태별 버튼 표 (Q27, T18 12장)", () => {
  const NOW = new Date(2026, 10, 25, 15, 0).getTime();
  const TODAY = new Date(2026, 10, 25, 0, 0).getTime();
  const cases: [
    OrderStatus,
    number,
    ReturnType<typeof summaryButtons>["cancel"],
    string | null,
  ][] = [
    ["pending", NOW, "enabled", "accept"],
    ["preparing", NOW, "enabled", "complete"],
    ["ready", NOW, "enabled", "pickup"],
    ["picked-up", TODAY, "enabled", null], // 오늘 0시 정각에 결제 = 오늘
    ["picked-up", NOW - 1000, "enabled", null],
    ["picked-up", TODAY - 1, "hidden", null], // 어제 23:59:59.999
    ["store-cancelled", NOW, "hidden", null],
    ["customer-cancelled", NOW, "hidden", null],
  ];
  it.each(cases)(
    "%s (결제 %s): 취소 %s, 다음 단계 %s",
    (status, paidAt, cancel, action) => {
      const b = summaryButtons(status, paidAt, NOW);
      expect(b.cancel).toBe(cancel);
      expect(b.next?.action ?? null).toBe(action);
    },
  );
});

describe("처리 단계 표시", () => {
  const base = {
    paidAt: 1000,
    statusTimes: { preparingAt: 2000, readyAt: 3000, pickedUpAt: null },
  } as Order;
  it("지난 단계는 done + 시각, 현재는 current, 남은 것은 todo", () => {
    const steps = buildSteps({ ...base, status: "ready" });
    expect(steps.map((s) => [s.label, s.state, s.at])).toEqual([
      ["접수대기", "done", 1000],
      ["제조중", "done", 2000],
      ["제조완료", "current", null],
      ["픽업완료", "todo", null],
    ]);
  });
  it("접수대기면 첫 단계가 현재이고 나머지는 todo", () => {
    const steps = buildSteps({ ...base, status: "pending" });
    expect(steps.map((s) => s.state)).toEqual([
      "current",
      "todo",
      "todo",
      "todo",
    ]);
  });
  it("픽업완료면 네 단계 모두 done이고 마지막 단계에도 시각이 있다 (A-2)", () => {
    const steps = buildSteps({
      ...base,
      status: "picked-up",
      statusTimes: { preparingAt: 2000, readyAt: 3000, pickedUpAt: 4000 },
    });
    expect(steps.map((s) => [s.state, s.at])).toEqual([
      ["done", 1000],
      ["done", 2000],
      ["done", 3000],
      ["done", 4000],
    ]);
  });
  it("지난 단계의 시각이 서버에서 안 오면 시각만 비우고 체크는 남긴다", () => {
    const steps = buildSteps({
      ...base,
      status: "picked-up",
      statusTimes: { preparingAt: null, readyAt: null, pickedUpAt: null },
    });
    expect(steps[1]).toMatchObject({ state: "done", at: null });
    expect(steps[3]).toMatchObject({ state: "done", at: null });
  });
});

describe("글자 수 · 사유 (Q18 · Q40)", () => {
  it("보이는 글자 하나를 1자로 센다 (띄어쓰기 · 합친 이모지 포함)", () => {
    expect(countChars("가 나")).toBe(3);
    expect(countChars("👨‍👩‍👧")).toBe(1);
    expect(countChars("🙂🙂")).toBe(2);
  });
  it("50자를 넘는 입력은 50자까지만 남기고 알린다, 줄바꿈은 뺀다", () => {
    expect(clampReason("a".repeat(50))).toEqual({
      text: "a".repeat(50),
      truncated: false,
    });
    const over = clampReason("a".repeat(49) + "🙂🙂");
    expect(over.truncated).toBe(true);
    expect(countChars(over.text)).toBe(CANCEL_REASON_MAX);
    expect(clampReason("가\n나\r\n다").text).toBe("가나다");
  });
  it("사유: 미선택이면 null, 고른 문구 그대로, 직접 입력은 공백이면 null · 아니면 앞뒤 공백 제거", () => {
    expect(resolveReason(null, "")).toBeNull();
    expect(resolveReason("재료가 소진되었습니다", "무시")).toBe(
      "재료가 소진되었습니다",
    );
    expect(resolveReason("custom", "   ")).toBeNull();
    expect(resolveReason("custom", "  사정  ")).toBe("사정");
  });
});

describe("표시 형식", () => {
  it("연락처는 끝 4자리만 「***-****-1234」", () => {
    expect(formatPhone("1234")).toBe("***-****-1234");
  });
  it("주문일시는 YYYY-MM-DD HH:mm", () => {
    expect(formatDateTime(new Date(2026, 10, 19, 9, 5).getTime())).toBe(
      "2026-11-19 09:05",
    );
  });
});
