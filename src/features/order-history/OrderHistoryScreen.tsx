// 주문내역 탭 화면 (SPEC-order-history 2장). 기간 · 검색 · 상태 탭 · 목록 · 페이지를 서버에 묻고 보여 준다.
// 걸러 세는 일은 서버가 한다: 이 화면은 조건을 바꿔 다시 묻기만 한다.
// 다른 메인 탭에 갔다 와도 보던 목록 · 상세가 남도록 MainContent가 이 화면을 내리지 않고 숨긴다 (11장 C).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  PAGE_SIZES,
  type HistoryPage,
  type HistoryQuery,
  type HistoryTab,
  type OrderHistoryApi,
  type PageSize,
} from "../../shared/api/order-history";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { errorSummary } from "../../shared/error-summary";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { TabBar } from "../../shared/ui/TabBar";
import { Toast } from "../../shared/ui/Toast";
import { panelId } from "../../shared/ui/tab-ids";
import { useNow } from "../order-board/use-now";
import { Calendar } from "./Calendar";
import { HistoryDetail } from "./HistoryDetail";
import { loadPageSize, savePageSize } from "./history-storage";
import {
  formatPeriod,
  isSelectableDay,
  formatRowTime,
  formatWon,
  menuLine,
  normalizeQuery,
  pageCount,
  pageWindow,
  presets,
  PRESET_IDS,
  shiftPeriod,
  summaryLine,
  type Period,
} from "./history-logic";
import {
  HISTORY_TABS,
  HISTORY_TEXTS,
  PRESET_LABELS,
  STATUS_VIEW,
} from "./history-texts";

/** 검색은 입력이 멈춘 뒤에 보낸다. 글자마다 서버에 묻지 않는다. */
export const SEARCH_DELAY_MS = 400;

interface Result {
  key: string;
  page: HistoryPage | null;
}

const COLUMNS = "grid-cols-[5rem_6rem_1fr_7rem_6rem_8rem]";
const CONTROL =
  "min-h-12 rounded-lg border border-gray-300 bg-white px-4 text-lg disabled:opacity-30";

/** [주문내역] 탭을 누른 알림: 누를 때마다 seq가 오르고, at은 누른 시각(ms)이다. */
export interface HistoryRefresh {
  seq: number;
  at: number;
}

export function OrderHistoryScreen({
  api,
  refresh,
}: {
  api: OrderHistoryApi;
  refresh: HistoryRefresh;
}) {
  // 며칠씩 켜 두므로 0시가 지나면 이전 · 다음 · 달력 범위가 따라가게 1분마다 시각을 읽는다.
  // 탭을 누른 시각이 더 새로우면 그것을 쓴다: 0시 직후 신호(1분 간격)를 기다리지 않고 되돌림 · 조회가 오늘 기준이 된다.
  const now = Math.max(useNow(60_000), refresh.at);
  // 처음 열면 오늘 (2.1).
  const [period, setPeriod] = useState<Period>(() => presets(now).today);
  const [tab, setTab] = useState<HistoryTab>("all");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(loadPageSize);
  const [reloadKey, setReloadKey] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; message: string } | null>(
    null,
  );
  const [result, setResult] = useState<Result | null>(null);

  const query: HistoryQuery = {
    fromDay: period.from,
    toDay: period.to,
    tab,
    q,
    page,
    size,
  };
  // 조건이 바뀌면 key가 달라져, 아직 새 응답이 없는 동안은 「불러오는 중」으로 본다.
  const key = JSON.stringify([query, reloadKey]);

  useEffect(() => {
    let current = true;
    withTimeout(api.fetchPage(query)).then(
      (next) => current && setResult({ key, page: next }),
      (error: unknown) => {
        if (!current) return;
        setResult({ key, page: null });
        void logInfo(
          logMessages.historyRequestFailed(
            "list",
            error instanceof RequestTimeoutError,
            errorSummary(error).name,
          ),
        );
      },
    );
    return () => {
      current = false;
    };
    // query는 key로 같은 값을 대신한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, key]);

  const loaded = result?.key === key ? result : null;
  const data = loaded?.page ?? null;

  // 검색칸: 멈춘 뒤에 적용하고, 지우면 바로 고른 기간으로 돌아간다 (2.2 · 11장 A).
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  function applyQuery(next: string) {
    setQ(next);
    setPage(1);
  }
  function onSearchInput(raw: string) {
    const value = raw.replace(/[^\d#]/g, "");
    setDraft(value);
    clearTimeout(searchTimer.current);
    const next = normalizeQuery(value);
    if (next === "") applyQuery("");
    else
      searchTimer.current = setTimeout(() => applyQuery(next), SEARCH_DELAY_MS);
  }

  function changePeriod(next: Period) {
    setPeriod(next);
    setPage(1);
  }

  // 상세에 들어갈 때 목록 스크롤을 기억해 두고, 돌아오면 되돌린다 (3장).
  // 돌아온 직후 목록이 다시 조회 중일 수 있으므로(상태를 바꾼 경우) 데이터가 보인 뒤에 되돌린다.
  const scroller = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const returnedFrom = useRef<string | null>(null);
  const restoreScroll = useRef(false);
  useLayoutEffect(() => {
    if (detailId !== null || !loaded) return;
    if (!restoreScroll.current && returnedFrom.current === null) return;
    if (scroller.current) scroller.current.scrollTop = savedScroll.current;
    if (returnedFrom.current !== null) {
      scroller.current
        ?.querySelector<HTMLElement>(
          `[data-order-id="${CSS.escape(returnedFrom.current)}"]`,
        )
        ?.focus({ preventScroll: true });
    }
    returnedFrom.current = null;
    restoreScroll.current = false;
  }, [detailId, loaded]);

  // 탭을 누를 때마다 같은 조건으로 다시 조회한다 (렌더 중에 맞춤). 처음 열 때는 마운트 조회가 있으므로 건너뛴다.
  // 다시 조회하는 동안 목록이 비어 스크롤이 0으로 잘리므로 마지막 위치를 기억해 두었다가 데이터가 오면 되돌린다.
  const [seenRefresh, setSeenRefresh] = useState(refresh.seq);
  if (seenRefresh !== refresh.seq) {
    setSeenRefresh(refresh.seq);
    setReloadKey((k) => k + 1);
  }
  useEffect(() => {
    restoreScroll.current = true;
  }, [refresh.seq]);

  const prev = shiftPeriod(period, -1, now);
  const nextPeriod = shiftPeriod(period, 1, now);
  // 며칠씩 켜 두다 0시가 지나 고른 기간이 조회 범위(최근 한 달)를 벗어나면 「오늘」로 되돌린다 (사용자 결정 A-1).
  // 1분마다 읽는 시각(now)에 맞춰 렌더 중에 확인하므로, 숨겨 둔 탭에 돌아올 때 이미 맞춰져 있다 (렌더 중에 맞춤).
  if (!isSelectableDay(period.from, now) || !isSelectableDay(period.to, now)) {
    setPeriod(presets(now).today);
    setPage(1);
  }
  const searching = q !== "";
  // 새 응답을 기다리는 동안에도 마지막 건수 · 쪽 수를 보여 눌러야 할 자리가 움직이지 않게 한다.
  const shown = data ?? result?.page ?? null;
  const totalPages = shown ? pageCount(shown.counts[tab], size) : page;
  // 상태를 바꿔 목록이 줄어 현재 쪽이 끝을 넘으면 마지막 쪽으로 맞춘다 (렌더 중에 맞춤).
  if (data && page > totalPages) setPage(totalPages);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div hidden={detailId !== null} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-2 border-b border-gray-200 px-4 py-2">
          <div className="flex items-center gap-3">
            <input
              type="text"
              aria-label={HISTORY_TEXTS.searchLabel}
              placeholder={HISTORY_TEXTS.searchPlaceholder}
              inputMode="numeric"
              maxLength={17}
              value={draft}
              onChange={(e) => onSearchInput(e.target.value)}
              className="min-h-12 flex-1 rounded-lg border border-gray-300 px-4 text-lg"
            />
            <button
              type="button"
              onClick={() => {
                restoreScroll.current = true; // 다시 조회해도 보던 위치를 지킨다
                setReloadKey((k) => k + 1);
              }}
              className={CONTROL}
            >
              {HISTORY_TEXTS.refresh}
            </button>
          </div>
          {searching && (
            <p role="status" className="text-base font-bold text-blue-700">
              {HISTORY_TEXTS.searchNotice}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => changePeriod(presets(now)[id])}
                className={CONTROL}
              >
                {PRESET_LABELS[id]}
              </button>
            ))}
            <span className="flex-1" />
            <button
              type="button"
              aria-label={HISTORY_TEXTS.prevPeriod}
              disabled={prev === null}
              onClick={() => prev && changePeriod(prev)}
              className={CONTROL}
            >
              &lt;
            </button>
            <button
              type="button"
              aria-label={HISTORY_TEXTS.periodLabel}
              onClick={() => setCalendarOpen(true)}
              className={`${CONTROL} min-w-44 font-bold`}
            >
              {formatPeriod(period)}
            </button>
            <button
              type="button"
              aria-label={HISTORY_TEXTS.nextPeriod}
              disabled={nextPeriod === null}
              onClick={() => nextPeriod && changePeriod(nextPeriod)}
              className={CONTROL}
            >
              &gt;
            </button>
          </div>
        </div>

        <TabBar<HistoryTab>
          label={HISTORY_TEXTS.tabsLabel}
          tabs={HISTORY_TABS.map((t) => ({
            id: t.id,
            label: shown ? `${t.label} ${shown.counts[t.id]}` : t.label,
          }))}
          activeId={tab}
          idPrefix="history"
          size="sub"
          onSelect={(id) => {
            setTab(id);
            setPage(1);
          }}
        />
        <div
          role="tabpanel"
          id={panelId("history", tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* 조회 중에도 자리를 비워 두어 아래 목록이 출렁이지 않게 한다. */}
          <p className="min-h-12 border-b border-gray-200 px-4 py-2 text-lg font-bold">
            {data && summaryLine(tab, data.counts, data.summary)}
          </p>
          <div
            ref={scroller}
            // 조회 중(목록이 비어 있을 때)의 0으로 잘린 위치는 기억하지 않는다.
            onScroll={(e) => {
              if (loaded) savedScroll.current = e.currentTarget.scrollTop;
            }}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {loaded === null ? (
              <p className="p-8 text-center text-xl text-gray-500">
                {HISTORY_TEXTS.loading}
              </p>
            ) : data === null ? (
              <div className="flex flex-col items-center gap-4 p-8 text-xl text-gray-600">
                <p>{HISTORY_TEXTS.listFailed}</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className={`${CONTROL} min-h-14 text-xl`}
                >
                  {HISTORY_TEXTS.retry}
                </button>
              </div>
            ) : data.rows.length === 0 ? (
              <p className="p-8 text-center text-xl text-gray-500">
                {HISTORY_TEXTS.empty}
              </p>
            ) : (
              <>
                <div
                  aria-hidden="true"
                  className={`grid ${COLUMNS} gap-2 bg-gray-50 px-4 py-2 text-base text-gray-500`}
                >
                  {HISTORY_TEXTS.columns.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
                <ul>
                  {data.rows.map((row) => {
                    const view = STATUS_VIEW[row.status];
                    return (
                      <li
                        key={row.orderId}
                        className="border-b border-gray-100"
                      >
                        <button
                          type="button"
                          data-order-id={row.orderId}
                          onClick={() => {
                            savedScroll.current =
                              scroller.current?.scrollTop ?? 0;
                            setDetailId(row.orderId);
                          }}
                          className={`grid min-h-14 w-full ${COLUMNS} items-center gap-2 px-4 text-left text-lg ${
                            row.status === "pending" ? "bg-yellow-100" : ""
                          }`}
                        >
                          <span className="font-bold">#{row.pickupNumber}</span>
                          <span>{row.customerName}</span>
                          <span className="truncate">
                            {menuLine(row.menuNames)}
                          </span>
                          <span>{formatWon(row.paidAmount)}</span>
                          <span className={`font-bold ${view.color}`}>
                            {view.label}
                          </span>
                          <span>{formatRowTime(row.paidAt)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
          <nav
            aria-label="페이지"
            className="flex flex-wrap items-center gap-2 border-t border-gray-200 px-4 py-2"
          >
            <select
              aria-label={HISTORY_TEXTS.pageSize}
              value={size}
              onChange={(e) => {
                const next = Number(e.target.value) as PageSize;
                setSize(next);
                savePageSize(next);
                setPage(1);
              }}
              className={CONTROL}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {HISTORY_TEXTS.pageSizeOption(n)}
                </option>
              ))}
            </select>
            <span className="flex-1" />
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className={CONTROL}
            >
              {HISTORY_TEXTS.prevPage}
            </button>
            {pageWindow(page, totalPages).map((n) => (
              <button
                key={n}
                type="button"
                aria-current={n === page ? "page" : undefined}
                onClick={() => setPage(n)}
                className={`${CONTROL} min-w-12 ${n === page ? "border-blue-600 bg-blue-600 font-bold text-white" : ""}`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
              className={CONTROL}
            >
              {HISTORY_TEXTS.nextPage}
            </button>
          </nav>
        </div>
      </div>

      {detailId !== null && (
        <HistoryDetail
          orderId={detailId}
          api={api}
          refreshSeq={refresh.seq}
          onBack={() => {
            returnedFrom.current = detailId;
            setDetailId(null);
          }}
          onChanged={() => setReloadKey((k) => k + 1)}
          onToast={(message) =>
            setToast((t) => ({ key: (t?.key ?? 0) + 1, message }))
          }
        />
      )}
      {calendarOpen && (
        <Calendar
          now={now}
          initial={period}
          onClose={() => setCalendarOpen(false)}
          onConfirm={(next) => {
            changePeriod(next);
            setCalendarOpen(false);
          }}
        />
      )}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
