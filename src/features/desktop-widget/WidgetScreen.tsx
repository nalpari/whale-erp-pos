// 위젯 창 화면 (T06 스펙 3.3 · 3.4). 본 창이 보내 준 WidgetView를 그리고, 누른 것은 onCommand로 돌려보낸다.
// 터치 우선이라 버튼은 44px 이상이다. 마우스를 올렸을 때만 보이는 것은 없다.
import { AUTO_OFF_BANNER } from "../../shared/orders/order-texts";
import {
  ACTION_BUTTONS,
  BOARD_TEXTS,
  STATUS_LABELS,
} from "../order-board/board-texts";
import { formatClock } from "../order-board/order-board-logic";
import { BUTTON_COLORS, CARD_COLORS } from "../order-board/card-colors";
import { ArrivalText } from "../order-board/OrderCard";
import { useNow } from "../order-board/use-now";
import { widgetMenu } from "./widget-logic";
import type {
  WidgetCardView,
  WidgetCommand,
  WidgetView,
} from "./widget-protocol";
import { WIDGET_TEXTS } from "./widget-texts";

interface Props {
  view: WidgetView;
  /** 화면 높이 때문에 이만큼만 그린다. 못 그린 카드는 「+ N건」에 더한다. 없으면 전부. */
  limit?: number | null;
  /** 위젯 쪽 연결이 실패했다 (화면 받기 · 동작 보내기). 본 창이 알린 linkFailed와 같이 안내한다. */
  linkFailed?: boolean;
  onCommand(command: WidgetCommand): void;
}

const CLOSE =
  "flex min-h-11 min-w-11 items-center justify-center rounded-lg text-2xl text-gray-500";
const BUTTON =
  "min-h-11 flex-1 rounded-lg text-lg font-bold disabled:opacity-60";

function UndoCard({
  card,
  onCommand,
}: {
  card: WidgetCardView;
  onCommand(command: WidgetCommand): void;
}) {
  const now = useNow(1000);
  const seconds = Math.max(
    0,
    Math.ceil(((card.undoExpiresAt ?? now) - now) / 1000),
  );
  return (
    <article
      data-widget-card
      aria-label={`픽업번호 ${card.pickupNumber}`}
      className="flex flex-col gap-2 rounded-xl border-2 border-gray-400 bg-gray-100 p-3"
    >
      <p className="text-lg font-bold">
        #{card.pickupNumber} {WIDGET_TEXTS.pickedUp}
      </p>
      <button
        type="button"
        disabled={card.busy}
        onClick={() =>
          onCommand({
            type: "action",
            orderId: card.orderId,
            action: "undo-pickup",
          })
        }
        className={`${BUTTON} border border-gray-400 bg-white text-gray-800`}
      >
        {BOARD_TEXTS.undoPickup(seconds)}
      </button>
      {card.failure && (
        <p role="alert" className="text-base font-bold text-red-600">
          {card.failure}
        </p>
      )}
    </article>
  );
}

function OrderCardView({
  card,
  onCommand,
}: {
  card: WidgetCardView;
  onCommand(command: WidgetCommand): void;
}) {
  if (card.status === "picked-up") {
    return <UndoCard card={card} onCommand={onCommand} />;
  }
  const status = card.status;
  const { shown, moreCount } = widgetMenu(card.items);
  const button = ACTION_BUTTONS[status];
  const open = () => onCommand({ type: "open", orderId: card.orderId });
  return (
    <article
      data-widget-card
      aria-label={`픽업번호 ${card.pickupNumber}`}
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          open();
        }
      }}
      className={`flex flex-col gap-1 rounded-xl border-2 p-3 ${CARD_COLORS[status]}`}
    >
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold">
          {STATUS_LABELS[status]}
          {card.unprinted && (
            <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-base text-white">
              {WIDGET_TEXTS.unprinted}
            </span>
          )}
        </span>
        <button
          type="button"
          aria-label={WIDGET_TEXTS.closeCard}
          onClick={(e) => {
            e.stopPropagation();
            onCommand({ type: "close-card", orderId: card.orderId });
          }}
          className={CLOSE}
        >
          ×
        </button>
      </header>
      <p className="flex justify-between text-base text-gray-700">
        <span>
          주문시간 {formatClock(card.paidAt)} | <ArrivalText order={card} />
        </span>
        <span className="text-xl font-bold text-gray-900">
          #{card.pickupNumber}
        </span>
      </p>
      {card.note && (
        <p className="truncate rounded bg-yellow-200 px-2 py-1 text-base">
          {card.note}
        </p>
      )}
      <ul className="text-lg">
        {shown.map((item, i) => (
          <li key={i} className="flex gap-1">
            <span className="truncate">{item.name}</span>
            <span className="shrink-0">× {item.quantity}</span>
          </li>
        ))}
      </ul>
      {moreCount > 0 && (
        <p className="font-bold text-gray-700">
          {WIDGET_TEXTS.moreItems(moreCount)}
        </p>
      )}
      <div className="mt-1 flex gap-2">
        {status === "pending" && (
          <button
            type="button"
            disabled={card.busy}
            onClick={(e) => {
              e.stopPropagation();
              onCommand({ type: "cancel", orderId: card.orderId });
            }}
            className={`${BUTTON} border border-gray-400 bg-white text-gray-800`}
          >
            {WIDGET_TEXTS.cancel}
          </button>
        )}
        <button
          type="button"
          disabled={card.busy}
          onClick={(e) => {
            e.stopPropagation(); // 카드 누름(본 창 요약 팝업)과 겹치지 않게 한다.
            onCommand({
              type: "action",
              orderId: card.orderId,
              action: button.action,
            });
          }}
          className={`${BUTTON} ${BUTTON_COLORS[status]}`}
        >
          {card.busy ? BOARD_TEXTS.busy : button.label}
        </button>
      </div>
      {card.failure && (
        <p role="alert" className="text-base font-bold text-red-600">
          {card.failure}
        </p>
      )}
    </article>
  );
}

export function WidgetScreen({
  view,
  limit = null,
  linkFailed = false,
  onCommand,
}: Props) {
  const cards = limit === null ? view.cards : view.cards.slice(0, limit);
  const moreCount = view.moreCount + (view.cards.length - cards.length);
  return (
    <div className="flex flex-col gap-2 bg-white p-2">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-xl font-bold">{WIDGET_TEXTS.title}</h1>
        <button
          type="button"
          aria-label={WIDGET_TEXTS.closeAll}
          onClick={() => onCommand({ type: "close-all" })}
          className={CLOSE}
        >
          ×
        </button>
      </header>
      {(linkFailed || view.linkFailed) && (
        <p
          role="alert"
          className="rounded-xl bg-red-600 p-3 text-base font-bold text-white"
        >
          {WIDGET_TEXTS.useMainWindow}
        </p>
      )}
      {view.autoOffCard && (
        <div
          role="alert"
          tabIndex={0}
          onClick={() => onCommand({ type: "auto-off-open" })}
          onKeyDown={(e) => {
            if (
              e.target === e.currentTarget &&
              (e.key === "Enter" || e.key === " ")
            ) {
              e.preventDefault();
              onCommand({ type: "auto-off-open" });
            }
          }}
          className="flex items-start gap-1 rounded-xl bg-red-600 p-3 text-base font-bold text-white"
        >
          <p className="flex-1">{AUTO_OFF_BANNER}</p>
          <button
            type="button"
            aria-label={WIDGET_TEXTS.closeCard}
            onClick={(e) => {
              e.stopPropagation();
              onCommand({ type: "auto-off-close" });
            }}
            className="flex min-h-11 min-w-11 items-center justify-center text-2xl"
          >
            ×
          </button>
        </div>
      )}
      {cards.map((card) => (
        <OrderCardView key={card.orderId} card={card} onCommand={onCommand} />
      ))}
      {moreCount > 0 && (
        <button
          type="button"
          onClick={() => onCommand({ type: "more" })}
          className="min-h-11 rounded-lg bg-gray-800 text-lg font-bold text-white"
        >
          {WIDGET_TEXTS.moreOrders(moreCount)}
        </button>
      )}
    </div>
  );
}
