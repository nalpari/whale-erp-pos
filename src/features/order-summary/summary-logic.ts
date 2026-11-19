// 요약 팝업 · 취소 사유 팝업의 순수 함수 (SPEC-order-summary 2.3 · 3장). 화면과 서버를 모른다.
import type { Order, OrderAction, OrderStatus } from "../../shared/api/orders";
import { STATUS_LABELS } from "../order-board/board-texts";
import type { CANCEL_TEXTS } from "./summary-texts";

export const CANCEL_REASON_MAX = 50;
/** 직접 입력을 고른 상태. 고정 사유 문구와 겹치지 않는 값이다. */
export const CUSTOM_REASON = "custom" as const;
/** 고른 사유: 고정 문구 넷 또는 직접 입력. */
export type ReasonChoice =
  (typeof CANCEL_TEXTS.reasons)[number] | typeof CUSTOM_REASON;

type NextAction = Exclude<OrderAction, "cancel" | "undo-pickup">;

export interface SummaryButtons {
  /** 보이는데 막힘(disabled), 보이지 않음(hidden), 눌림(enabled). */
  cancel: "enabled" | "disabled" | "hidden";
  /** 파란 강조 하나. 픽업완료 · 취소 상태에는 없다. */
  next: { action: NextAction; label: string } | null;
}

/** 스펙 2.3의 표(Q27). 인쇄 버튼은 T12 전까지 늘 막혀 있어 표에 두지 않는다. */
export function summaryButtons(status: OrderStatus): SummaryButtons {
  switch (status) {
    case "pending":
      return {
        cancel: "enabled",
        next: { action: "accept", label: "주문접수" },
      };
    case "preparing":
      return {
        cancel: "enabled",
        next: { action: "complete", label: "제조완료" },
      };
    case "ready":
      return {
        cancel: "disabled",
        next: { action: "pickup", label: "픽업완료" },
      };
    default:
      return { cancel: "hidden", next: null };
  }
}

export interface Step {
  label: string;
  state: "done" | "current" | "todo";
  /** 지난 단계의 시각(ms). 현재 · 남은 단계와, 서버가 시각을 안 준 단계는 null. */
  at: number | null;
}

const STEP_ORDER = ["pending", "preparing", "ready", "picked-up"] as const;

/** 처리 단계 4개 (Q16: 제조시작 단계 없음). */
export function buildSteps(order: Order): Step[] {
  const t = order.statusTimes;
  const times = [order.paidAt, t.preparingAt, t.readyAt, t.pickedUpAt];
  // 픽업완료면 모든 단계가 끝난 것이다: 마지막 단계도 체크 + 시각 (사용자 결정 A-2).
  const current =
    order.status === "picked-up"
      ? STEP_ORDER.length
      : STEP_ORDER.indexOf(order.status as (typeof STEP_ORDER)[number]);
  return STEP_ORDER.map((status, i) => {
    const state = i < current ? "done" : i === current ? "current" : "todo";
    return {
      label: STATUS_LABELS[status] ?? status,
      state,
      at: state === "done" ? times[i] : null,
    };
  });
}

const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });

/** 보이는 글자 하나를 1자로 센다 (Q40). */
export function countChars(text: string): number {
  let n = 0;
  for (const _ of segmenter.segment(text)) n += 1; // eslint-disable-line @typescript-eslint/no-unused-vars
  return n;
}

/** 줄바꿈을 빼고 50자까지만 남긴다. 넘어서 잘랐으면 truncated (붙여넣기 안내용). */
export function clampReason(raw: string): { text: string; truncated: boolean } {
  const oneLine = raw.replace(/[\r\n]+/g, "");
  let text = "";
  let n = 0;
  for (const { segment } of segmenter.segment(oneLine)) {
    if (n >= CANCEL_REASON_MAX) return { text, truncated: true };
    text += segment;
    n += 1;
  }
  return { text, truncated: false };
}

/**
 * 서버로 보낼 사유. 미선택이거나 직접 입력이 공백뿐이면 null(취소 버튼이 막힌다, Q18).
 * 고른 문구는 그대로, 직접 입력은 앞뒤 공백을 지운 값이다.
 */
export function resolveReason(
  selected: ReasonChoice | null,
  custom: string,
): string | null {
  if (selected === null) return null;
  if (selected !== CUSTOM_REASON) return selected;
  const trimmed = custom.trim();
  return trimmed === "" ? null : trimmed;
}

/** 연락처는 끝 4자리만 보인다 (11장 E). */
export function formatPhone(last4: string): string {
  return `***-****-${last4}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 주문일시 (결제 시각). */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
