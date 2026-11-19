// 직접 만든 달력 (SPEC-order-history 2.1, 새 라이브러리 없음). 하루 또는 기간을 고르고 [확인].
// 조회 범위(한 달 전 같은 날 ~ 오늘) 밖 날짜는 고를 수 없고, 달은 그 범위가 걸친 달만 넘길 수 있다.
import { useEffect, useRef, useState } from "react";
import {
  isSelectableDay,
  monthGrid,
  monthsInRange,
  pickDay,
  type Period,
} from "./history-logic";
import { HISTORY_TEXTS } from "./history-texts";

interface Props {
  now: number;
  initial: Period;
  onConfirm(period: Period): void;
  onClose(): void;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function Calendar({ now, initial, onConfirm, onClose }: Props) {
  const months = monthsInRange(now);
  // 지금 고른 기간이 있는 달부터 보인다.
  const [monthIndex, setMonthIndex] = useState(() => {
    const from = new Date(initial.from);
    const found = months.findIndex(
      (m) => m.year === from.getFullYear() && m.month === from.getMonth() + 1,
    );
    return found === -1 ? months.length - 1 : found;
  });
  const [selection, setSelection] = useState<Period | null>(initial);
  const [pickingEnd, setPickingEnd] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { year, month } = months[monthIndex];

  // 처음 열 때만 초점을 옮긴다. 부모가 다시 그려질 때마다 빼앗지 않는다.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const nav =
    "min-h-12 min-w-12 rounded-lg border border-gray-300 text-xl disabled:opacity-30";
  return (
    <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={HISTORY_TEXTS.openCalendar}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-40 left-1/2 w-[26rem] -translate-x-1/2 rounded-2xl bg-white p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={HISTORY_TEXTS.calendarPrevMonth}
            disabled={monthIndex === 0}
            onClick={() => setMonthIndex(monthIndex - 1)}
            className={nav}
          >
            ‹
          </button>
          <p className="text-xl font-bold">
            {year}년 {month}월
          </p>
          <button
            type="button"
            aria-label={HISTORY_TEXTS.calendarNextMonth}
            disabled={monthIndex === months.length - 1}
            onClick={() => setMonthIndex(monthIndex + 1)}
            className={nav}
          >
            ›
          </button>
        </div>
        <div className="mt-2 grid grid-cols-7 text-center text-base text-gray-500">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {monthGrid(year, month)
            .flat()
            .map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const selectable = isSelectableDay(day, now);
              const inRange =
                selection !== null &&
                day >= selection.from &&
                day <= selection.to;
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={`${month}월 ${new Date(day).getDate()}일`}
                  disabled={!selectable}
                  aria-pressed={inRange}
                  onClick={() => {
                    const next = pickDay(selection, pickingEnd, day);
                    setSelection(next.selection);
                    setPickingEnd(next.pickingEnd);
                  }}
                  className={`min-h-12 rounded-lg text-lg ${
                    inRange
                      ? "bg-blue-600 font-bold text-white"
                      : "text-gray-900"
                  } disabled:text-gray-300`}
                >
                  {new Date(day).getDate()}
                </button>
              );
            })}
        </div>
        <p className="mt-3 text-base text-gray-600">
          {HISTORY_TEXTS.calendarOlder}
        </p>
        <button
          type="button"
          disabled={selection === null}
          onClick={() => selection && onConfirm(selection)}
          className="mt-3 h-14 w-full rounded-xl bg-blue-600 text-xl font-bold text-white disabled:opacity-50"
        >
          {HISTORY_TEXTS.calendarConfirm}
        </button>
      </div>
    </div>
  );
}
