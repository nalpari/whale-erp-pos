// 주문 카드 하나 (SPEC-order-board 2.3 · 2.4). 개인정보는 서버가 가린 값만 보인다.
import { memo } from "react";
import type { Order, OrderAction } from "../../shared/api/orders";
import { ACTION_BUTTONS, BOARD_TEXTS, STATUS_LABELS } from "./board-texts";
import {
  formatClock,
  menuSummary,
  pickupSchedule,
  showAutoCancelWarning,
} from "./order-board-logic";
import { useNow } from "./use-now";

const MINUTE_MS = 60_000;

/** 색(p.11 그림) + 상태 글자. 색만으로 구분하지 않는다. */
const CARD_COLORS = {
  pending: "border-yellow-400 bg-yellow-50",
  preparing: "border-blue-400 bg-blue-50",
  ready: "border-green-500 bg-green-50",
  "picked-up": "border-gray-400 bg-gray-100",
  "store-cancelled": "border-gray-400 bg-gray-100",
  "customer-cancelled": "border-gray-400 bg-gray-100",
} as const;
const BUTTON_COLORS = {
  pending: "bg-yellow-500 text-gray-900",
  preparing: "bg-blue-600 text-white",
  ready: "bg-green-600 text-white",
} as const;

/** 1분마다 이 글자만 다시 그린다. */
export function PickupText({ order }: { order: Order }) {
  const { label, note } = pickupSchedule(order, useNow(MINUTE_MS));
  return (
    <span>
      {label}
      {note && (
        <>
          {" ("}
          <span className={note.overdue ? "font-bold text-red-600" : undefined}>
            {note.text}
          </span>
          {")"}
        </>
      )}
    </span>
  );
}

function AutoCancelWarning({ order }: { order: Order }) {
  if (!showAutoCancelWarning(order, useNow(MINUTE_MS))) return null;
  return (
    <p className="text-base font-bold text-red-600">
      {BOARD_TEXTS.autoCancelWarning}
    </p>
  );
}

interface Props {
  order: Order;
  /** 이 주문의 상태 변경 요청이 진행 중이다. */
  busy: boolean;
  onAction(orderId: string, action: Exclude<OrderAction, "cancel">): void;
  /** 카드(버튼 밖)를 눌렀을 때 (요약 팝업). */
  onOpen?(orderId: string): void;
}

export const OrderCard = memo(function OrderCard({
  order,
  busy,
  onAction,
  onOpen,
}: Props) {
  const { shown, moreCount } = menuSummary(order.items);
  const button =
    order.status === "pending" ||
    order.status === "preparing" ||
    order.status === "ready"
      ? ACTION_BUTTONS[order.status]
      : null;

  return (
    <article
      aria-label={`픽업번호 ${order.pickupNumber}`}
      // 터치 · 마우스 · 키보드(Enter · Space) 모두 요약 팝업을 연다. 팝업이 닫히면 초점이 이 카드로 돌아온다.
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(order.orderId)}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          onOpen?.(order.orderId);
        }
      }}
      className={`flex h-[480px] w-[300px] flex-col gap-2 rounded-xl border-2 p-3 ${CARD_COLORS[order.status]}`}
    >
      <header className="flex items-center justify-between">
        <span className="text-2xl font-bold">#{order.pickupNumber}</span>
        <span className="flex items-center gap-2 text-lg font-bold">
          {STATUS_LABELS[order.status]}
          <span aria-hidden="true" className="text-2xl text-gray-500">
            ›
          </span>
        </span>
      </header>
      <div className="text-base text-gray-700">
        <p>
          {formatClock(order.paidAt)} · {order.customerName}
        </p>
        <p>
          <PickupText order={order} />
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden text-lg">
        <ul>
          {shown.map((item, i) => (
            <li key={i} className="mb-1">
              <p className="flex gap-1">
                <span className="truncate">{item.name}</span>
                <span className="shrink-0">× {item.quantity}</span>
              </p>
              {item.options && item.options.length > 0 && (
                <p className="truncate text-sm text-gray-600">
                  {item.options.join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
        {moreCount > 0 && (
          <p className="font-bold text-gray-700">
            {BOARD_TEXTS.moreItems(moreCount)}
          </p>
        )}
      </div>
      {order.note && (
        <p className="line-clamp-2 rounded bg-yellow-200 px-2 py-1 text-base">
          {order.note}
        </p>
      )}
      {order.status === "pending" && <AutoCancelWarning order={order} />}
      {button && (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation(); // 카드 누름(T05 요약 팝업)과 겹치지 않게 한다.
            onAction(order.orderId, button.action);
          }}
          className={`min-h-14 rounded-lg text-xl font-bold disabled:opacity-60 ${BUTTON_COLORS[order.status as keyof typeof BUTTON_COLORS]}`}
        >
          {busy ? BOARD_TEXTS.busy : button.label}
        </button>
      )}
    </article>
  );
});
