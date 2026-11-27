// 주문 카드 하나 (SPEC-order-board 2.3 · 2.4). 개인정보는 서버가 가린 값만 보인다.
import { memo, useEffect, useState } from "react";
import type { Order, OrderAction } from "../../shared/api/orders";
import { BUTTON_COLORS, CARD_COLORS } from "./card-colors";
import { ACTION_BUTTONS, BOARD_TEXTS, STATUS_LABELS } from "./board-texts";
import {
  AUTO_CANCEL_WARNING_LEAD_MS,
  formatClock,
  menuSummary,
  arrivalSchedule,
  showAutoCancelWarning,
} from "./order-board-logic";
import { useNow } from "./use-now";

const MINUTE_MS = 60_000;

/** 1분마다 이 글자만 다시 그린다. */
export function ArrivalText({ order }: { order: Pick<Order, "arrivalAt"> }) {
  const { label, note } = arrivalSchedule(order, useNow(MINUTE_MS));
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

/** 매분 0초가 아니라 경고 시각(초 단위) 정각에 뜨도록 그 시각에 한 번만 다시 그린다. */
function AutoCancelWarning({ order }: { order: Order }) {
  const [now, setNow] = useState(Date.now);
  const warnAt = order.autoCancelAt - AUTO_CANCEL_WARNING_LEAD_MS;
  useEffect(() => {
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, warnAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [warnAt]);
  if (!showAutoCancelWarning(order, now)) return null;
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
  /** 주문서 출력에 실패했다: 「미출력」 꼬리표 (T12 스펙 5장). */
  unprinted?: boolean;
}

export const OrderCard = memo(function OrderCard({
  order,
  busy,
  onAction,
  onOpen,
  unprinted = false,
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
      // 위젯에서 카드를 눌러 팝업을 닫은 뒤 이 카드가 보이게 화면을 옮기는 기준이다.
      data-order-id={order.orderId}
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
          {unprinted && (
            <span className="rounded bg-red-600 px-2 py-0.5 text-base text-white">
              {BOARD_TEXTS.unprinted}
            </span>
          )}
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
          <ArrivalText order={order} />
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
