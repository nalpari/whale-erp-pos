// 주문 요약 팝업 (SPEC-order-summary 2장). 주문 한 건을 자세히 보이고 다음 단계 · 주문취소를 처리한다.
// 주문은 prop으로 받는다. 부르는 쪽이 useOrders() 목록에서 매번 찾아 넘겨야 다른 PC의 처리가 바로 반영된다 (2.5).
import { useEffect, useId, useRef, useState } from "react";
import type { Order, OrderAction } from "../../shared/api/orders";
import { BOARD_TEXTS, STATUS_LABELS } from "../order-board/board-texts";
import { formatClock } from "../order-board/order-board-logic";
import { PickupText } from "../order-board/OrderCard";
import { CancelReasonDialog } from "./CancelReasonDialog";
import {
  buildSteps,
  formatDateTime,
  formatPhone,
  summaryButtons,
} from "./summary-logic";
import { SUMMARY_TEXTS } from "./summary-texts";

interface Props {
  order: Order;
  /** 요청이 진행 중이다. 버튼을 막는다. */
  busy: boolean;
  onClose(): void;
  /** 다음 단계 요청. 성공이면 true. 실패 토스트는 부르는 쪽(주문접수 화면)이 보인다. */
  onAction(
    orderId: string,
    action: Exclude<OrderAction, "cancel">,
  ): Promise<boolean>;
  onError(orderId: string, message: string): void;
  /** 취소 요청을 보내기 직전 (CancelReasonDialog.onRequest). */
  onCancelRequest(orderId: string): void;
}

const BUTTON = "min-h-14 rounded-xl px-5 text-xl font-bold disabled:opacity-50";
const GRAY = `${BUTTON} border border-gray-300 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-400`;

export function OrderSummaryDialog({
  order,
  busy,
  onClose,
  onAction,
  onError,
  onCancelRequest,
}: Props) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const buttons = summaryButtons(order.status);
  // 사유 팝업이 실제로 떠 있을 때만 true. 상태가 바뀌어 막히면 사유 팝업이 사라지므로 Esc도 다시 이쪽이 받는다.
  const cancelShown = cancelOpen && buttons.cancel === "enabled";

  // 닫으면 열기 전 자리(눌렀던 카드)로 초점을 돌린다.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

  // Esc는 맨 위 팝업만 닫는다. 취소 사유 팝업이 열려 있으면 그쪽이 받는다.
  useEffect(() => {
    if (cancelShown) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [cancelShown, onClose]);

  async function next() {
    if (!buttons.next) return;
    const action = buttons.next.action;
    const ok = await onAction(order.orderId, action);
    // 성공하면 열린 채 새 상태로 바뀐다. [픽업완료]만 닫고 배너가 뜬다 (11장 D).
    if (ok && action === "pickup") onClose();
  }

  const label = STATUS_LABELS[order.status] ?? "";
  return (
    // 취소 사유 팝업은 바깥 영역 div의 자식이 아니라 형제로 둔다: 안쪽 클릭이 React 트리를 타고 올라가 요약 팝업을 닫지 않게.
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[calc(100vh-2rem)] w-[40rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-white shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 id={titleId} className="text-2xl font-bold">
              #{order.pickupNumber} <span className="ml-2">{label}</span>
            </h2>
            <button
              ref={closeRef}
              type="button"
              aria-label={SUMMARY_TEXTS.close}
              onClick={onClose}
              className="size-14 rounded-xl text-3xl text-gray-600"
            >
              ×
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            <ol
              aria-label={SUMMARY_TEXTS.steps}
              className="grid grid-cols-4 gap-2"
            >
              {buildSteps(order).map((step) => (
                <li
                  key={step.label}
                  aria-current={step.state === "current" ? "step" : undefined}
                  className={`rounded-lg px-2 py-2 text-center text-base ${
                    step.state === "current"
                      ? "bg-blue-600 font-bold text-white"
                      : step.state === "done"
                        ? "bg-gray-100 text-gray-800"
                        : "border border-gray-200 text-gray-400"
                  }`}
                >
                  <p>
                    {step.state === "done" && (
                      <span aria-hidden="true">✓ </span>
                    )}
                    {step.label}
                  </p>
                  {step.at !== null && <p>{formatClock(step.at)}</p>}
                </li>
              ))}
            </ol>

            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 text-lg">
              <dt className="text-gray-500">{SUMMARY_TEXTS.orderedAt}</dt>
              <dd>{formatDateTime(order.paidAt)}</dd>
              <dt className="text-gray-500">{SUMMARY_TEXTS.orderNumber}</dt>
              <dd>{order.orderNumber}</dd>
              <dt className="text-gray-500">{SUMMARY_TEXTS.pickupAt}</dt>
              <dd>
                <PickupText order={order} />
              </dd>
              <dt className="text-gray-500">{SUMMARY_TEXTS.customer}</dt>
              <dd>{order.customerName}</dd>
              <dt className="text-gray-500">{SUMMARY_TEXTS.phone}</dt>
              <dd>{formatPhone(order.phoneLast4)}</dd>
            </dl>

            {order.note && (
              <section aria-label={SUMMARY_TEXTS.note}>
                <h3 className="text-base font-bold text-gray-600">
                  {SUMMARY_TEXTS.note}
                </h3>
                <p className="mt-1 rounded bg-yellow-200 px-3 py-2 text-lg break-words whitespace-pre-wrap">
                  {order.note}
                </p>
              </section>
            )}

            <section aria-label={SUMMARY_TEXTS.menu}>
              <h3 className="text-base font-bold text-gray-600">
                {SUMMARY_TEXTS.menu}
              </h3>
              <ul className="mt-1 divide-y divide-gray-100">
                {order.items.map((item, i) => (
                  <li key={i} className="py-2">
                    <p className="text-xl break-words">
                      {item.name} × {item.quantity}
                    </p>
                    {item.options && item.options.length > 0 && (
                      <p className="text-base break-words text-gray-600">
                        {item.options.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t border-gray-200 px-6 py-4">
            {/* 인쇄는 T12에서 연결한다. 그 전까지 보이고 막아 둔다 (11장 A). */}
            <button type="button" disabled className={GRAY}>
              {SUMMARY_TEXTS.printReceipt}
            </button>
            <button type="button" disabled className={GRAY}>
              {SUMMARY_TEXTS.printOrder}
            </button>
            <span className="flex-1" />
            {buttons.cancel !== "hidden" && (
              <button
                type="button"
                disabled={buttons.cancel === "disabled" || busy}
                onClick={() => setCancelOpen(true)}
                className={GRAY}
              >
                {SUMMARY_TEXTS.cancel}
              </button>
            )}
            {buttons.next && (
              <button
                type="button"
                disabled={busy}
                onClick={next}
                className={`${BUTTON} bg-blue-600 text-white`}
              >
                {busy ? BOARD_TEXTS.busy : buttons.next.label}
              </button>
            )}
          </footer>
        </div>
      </div>
      {/* 다른 PC가 제조완료로 바꿔 [주문취소]가 막히면 사유 팝업도 같이 사라진다 (Q17). */}
      {cancelShown && (
        <CancelReasonDialog
          orderId={order.orderId}
          onBack={() => setCancelOpen(false)}
          onCancelled={onClose}
          onError={onError}
          onRequest={onCancelRequest}
        />
      )}
    </>
  );
}
