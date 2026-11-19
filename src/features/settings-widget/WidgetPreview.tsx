// 위젯 위치 · 상태 미리보기 (T10 스펙 3장 ⑤). 화면 모양 상자의 고른 모서리에 예시 카드를 보인다.
// 예시는 고정 문구이며 실제 주문이 아니다. 터치로 넘길 수 있게 [<] [>] 버튼은 44px 이상이다.
import { useState } from "react";
import { BUTTON_COLORS, CARD_COLORS } from "../order-board/card-colors";
import { ACTION_BUTTONS, STATUS_LABELS } from "../order-board/board-texts";
import type { WidgetStatus } from "../desktop-widget/widget-logic";
import type { WidgetPosition } from "../desktop-widget/widget-position";
import { WIDGET_SETTINGS_TEXTS as T } from "./widget-settings-texts";

const EXAMPLES = [
  { status: "pending", number: 12, menu: "아이스 아메리카노 1" },
  { status: "preparing", number: 11, menu: "카페라떼 2" },
  { status: "ready", number: 10, menu: "딸기 스무디 1" },
] as const;

// 상자 안 모서리 자리. 실제 위젯 여백(16px)보다 작게 둔 예시 여백이다.
const CORNER: Record<WidgetPosition, string> = {
  "top-left": "left-2 top-2",
  "top-right": "right-2 top-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-2 right-2",
};

const ARROW =
  "flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-gray-200 text-2xl font-bold";

export function WidgetPreview({
  position,
  statuses,
}: {
  position: WidgetPosition;
  /** 위젯에 보일 상태. 빠진 상태의 예시에는 「위젯에 표시 안 함」을 붙인다. */
  statuses: ReadonlySet<WidgetStatus>;
}) {
  const [index, setIndex] = useState(0);
  const example = EXAMPLES[index];
  const step = (d: number) =>
    setIndex((i) => (i + d + EXAMPLES.length) % EXAMPLES.length);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xl font-bold">{T.previewTitle}</p>
      <div
        data-testid="widget-preview-box"
        data-position={position}
        className="relative aspect-video w-full rounded-xl border-2 border-gray-400 bg-gray-200"
      >
        <article
          data-testid="widget-preview-card"
          className={`absolute w-2/5 rounded-lg border-2 p-2 text-sm ${CARD_COLORS[example.status]} ${CORNER[position]}`}
        >
          <p className="font-bold">
            #{example.number} {STATUS_LABELS[example.status]}
          </p>
          <p>{example.menu}</p>
          {!statuses.has(example.status) && (
            <p className="mt-1 font-bold text-red-700">{T.notShown}</p>
          )}
          <p
            className={`mt-1 rounded text-center font-bold ${BUTTON_COLORS[example.status]}`}
          >
            {ACTION_BUTTONS[example.status].label}
          </p>
        </article>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label={T.prev}
          className={ARROW}
          onClick={() => step(-1)}
        >
          &lt;
        </button>
        <span className="min-w-12 text-center text-lg">
          {index + 1} / {EXAMPLES.length}
        </span>
        <button
          type="button"
          aria-label={T.next}
          className={ARROW}
          onClick={() => step(1)}
        >
          &gt;
        </button>
      </div>
      <p className="text-center text-base text-gray-500">{T.previewNote}</p>
    </div>
  );
}
