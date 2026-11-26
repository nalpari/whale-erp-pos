// 주문서 줄 목록 (T12 스펙 3.1). 순수 함수: 화면 · 프린터 · 시계를 모른다.
import type { Order, RemakeItem } from "../../shared/api/orders";
import { RULE, type PrintLine } from "../../shared/printer/print-lines";
import { formatClock, pickupSchedule } from "../order-board/order-board-logic";
import { formatDateTime } from "../order-summary/summary-logic";
import { FORM_TEXTS } from "./print-texts";

/** 주문서에 필요한 값만. 주문접수 목록의 Order와 주문내역 상세가 모두 맞춰 줄 수 있다. */
export type OrderFormInput = Pick<
  Order,
  | "pickupNumber"
  | "orderNumber"
  | "paidAt"
  | "pickupChoice"
  | "customerName"
  | "phoneLast4"
  | "note"
> & {
  items: { name: string; quantity: number; options?: string[] }[];
};

/** 「박*준 (1234)」: 가린 이름 + 끝 4자리 (스펙 3.1). */
export function customerLabel(
  order: Pick<Order, "customerName" | "phoneLast4">,
) {
  return `${order.customerName} (${order.phoneLast4})`;
}

/** 「지금」 또는 「HH:mm」. 화면의 pickupSchedule(Q26)을 그대로 쓰고 뒤의 「 픽업」만 뗀다. */
export function pickupLabel(order: Pick<Order, "pickupChoice" | "paidAt">) {
  return pickupSchedule(order, order.paidAt).label.replace(/ 픽업$/, "");
}

/**
 * reprintAt이 있으면 맨 위에 「[재출력] HH:mm」(출력 시각)을 찍는다.
 * remake가 있으면 대신 「[재제조] HH:mm」과 「사유: …」를 찍고, 메뉴는 고른 줄 · 수량만 찍는다: 둘은 겹치지 않는다 (print-forms 13장).
 */
export function buildOrderLines(
  order: OrderFormInput,
  options: {
    reprintAt?: number;
    remake?: { at: number; reason: string; items: RemakeItem[] };
  } = {},
): PrintLine[] {
  const lines: PrintLine[] = [];
  if (options.remake) {
    lines.push(
      {
        text: FORM_TEXTS.remake(formatClock(options.remake.at)),
        bold: true,
        size: 12,
      },
      {
        text: `${FORM_TEXTS.remakeReason}: ${options.remake.reason}`,
        bold: true,
      },
    );
  } else if (options.reprintAt !== undefined) {
    lines.push({
      text: FORM_TEXTS.reprint(formatClock(options.reprintAt)),
      bold: true,
      size: 12,
    });
  }
  lines.push(
    { text: FORM_TEXTS.orderTitle, bold: true, align: "center" },
    { text: `#${order.pickupNumber}`, size: 36, bold: true, align: "center" },
    RULE,
    { text: `${FORM_TEXTS.orderNumber}: ${order.orderNumber}` },
    { text: `${FORM_TEXTS.orderedAt}: ${formatDateTime(order.paidAt)}` },
    { text: `${FORM_TEXTS.customer}: ${customerLabel(order)}` },
    { text: `${FORM_TEXTS.pickupAt}: ${pickupLabel(order)}` },
  );
  // 요청사항이 없으면 그 줄을 찍지 않는다.
  if (order.note) {
    lines.push({
      text: `${FORM_TEXTS.note}: ${order.note}`,
      bold: true,
      size: 12,
    });
  }
  lines.push(RULE);
  const items = options.remake
    ? options.remake.items.flatMap(({ itemIndex, quantity }) => {
        const item = order.items[itemIndex];
        return item ? [{ ...item, quantity }] : [];
      })
    : order.items;
  items.forEach((item, index) => {
    if (index > 0) lines.push(RULE);
    lines.push({
      text: `${item.name} × ${item.quantity}`,
      bold: true,
      size: 13,
    });
    // 화면은 옵션을 콤마 한 줄로 보이지만 출력물은 옵션마다 줄을 바꾼다 (Q49 ②).
    for (const option of item.options ?? []) {
      lines.push({ text: `ㄴ ${option}`, size: 11 });
    }
  });
  return lines;
}
