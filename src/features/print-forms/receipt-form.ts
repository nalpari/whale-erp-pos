// 영수증 줄 목록 (T12 스펙 4.2). 순수 함수. 과세금액 · 부가세는 서버 값을 그대로 찍는다(앱이 계산하지 않음).
import type {
  HistoryOrder,
  ReceiptStore,
} from "../../shared/api/order-history";
import { RULE, type PrintLine } from "../../shared/printer/print-lines";
import { formatDateTime } from "../order-summary/summary-logic";
import { FORM_TEXTS } from "./print-texts";

export function isCancelled(status: HistoryOrder["status"]): boolean {
  return status === "store-cancelled" || status === "customer-cancelled";
}

/** 천 단위 쉼표. 취소 영수증은 금액을 모두 마이너스로 찍는다 (Q50 ③). 0은 부호를 붙이지 않는다. */
export function money(amount: number, negative: boolean): string {
  const text = String(Math.abs(Math.round(amount))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return negative && amount !== 0 ? `-${text}` : text;
}

export function buildReceiptLines(
  order: HistoryOrder,
  store: ReceiptStore,
): PrintLine[] {
  const cancelled = isCancelled(order.status);
  const m = (amount: number) => money(amount, cancelled);
  const pay = order.payment;
  const pair = (label: string, value: string): PrintLine => ({
    text: label,
    right: value,
  });

  const lines: PrintLine[] = [
    {
      text: cancelled ? FORM_TEXTS.cancelReceiptTitle : FORM_TEXTS.receiptTitle,
      size: 16,
      bold: true,
      align: "center",
    },
    RULE,
    { text: store.name, bold: true, align: "center" },
    { text: `${FORM_TEXTS.phone}: ${store.phone}` },
    { text: `${FORM_TEXTS.address}: ${store.address}` },
    { text: `${FORM_TEXTS.representative}: ${store.representative}` },
    { text: `${FORM_TEXTS.businessNumber}: ${store.businessNumber}` },
    { text: `${FORM_TEXTS.soldAt}: ${formatDateTime(order.paidAt)}` },
    { text: `${FORM_TEXTS.orderNumber}: ${order.orderNumber}` },
    RULE,
  ];

  for (const item of order.items) {
    lines.push({
      text: `${item.name} × ${item.quantity}`,
      right: m(item.unitPrice * item.quantity),
    });
    for (const option of item.options) {
      lines.push({
        text: `ㄴ ${option.name}`,
        right: option.price > 0 ? m(option.price * item.quantity) : undefined,
        size: 9,
      });
    }
  }

  lines.push(RULE, pair(FORM_TEXTS.orderAmount, m(pay.orderAmount)));
  for (const discount of pay.discounts) {
    lines.push(pair(FORM_TEXTS.discount[discount.kind], m(discount.amount)));
  }
  // 전액 할인(결제 0원)은 「결제금액」 줄 없이 아래 「결제 금액 0원」과 할인 내역만 보인다 (사용자 결정 2026-11-19).
  if (pay.paidAmount !== 0) {
    lines.push({
      ...pair(FORM_TEXTS.paidAmount, m(pay.paidAmount)),
      bold: true,
      size: 12,
    });
  }
  lines.push(
    pair(FORM_TEXTS.taxable, m(pay.taxableAmount)),
    pair(FORM_TEXTS.vat, m(pay.vat)),
    RULE,
  );

  if (pay.paidAmount === 0) {
    // 포인트 · 쿠폰으로 전액 결제: 결제 줄 대신 「결제 금액 0원」과 할인 내역만 (Q50 ①).
    lines.push({ text: FORM_TEXTS.paidZero, bold: true });
    return lines;
  }
  if (pay.card) {
    lines.push(
      pair(FORM_TEXTS.cardNumber, pay.card.maskedNumber),
      pair(FORM_TEXTS.cardKind, pay.card.kind),
      pair(FORM_TEXTS.cardDivision, pay.card.division),
    );
  } else {
    // 카드가 아닌 결제(간편결제 등)는 카드 정보 줄을 빼고 결제수단 · 승인번호 · 승인일시만 (Q50 ①).
    lines.push(pair(FORM_TEXTS.method, pay.method));
  }
  if (pay.approvalNumber) {
    lines.push(pair(FORM_TEXTS.approvalNumber, pay.approvalNumber));
  }
  if (pay.approvedAt !== null) {
    lines.push(pair(FORM_TEXTS.approvedAt, formatDateTime(pay.approvedAt)));
  }
  if (pay.card) lines.push(pair(FORM_TEXTS.acquirer, pay.card.acquirer));
  return lines;
}
