// 메뉴품절 화면 (SPEC-soldout). 열 때와 [메뉴품절] 탭을 누를 때마다 서버에서 읽고, 바꾸면 바로 저장한다.
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SoldOutApi,
  SoldOutEntry,
  SoldOutMode,
} from "../../shared/api/soldout";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { TabBar } from "../../shared/ui/TabBar";
import { panelId, tabId } from "../../shared/ui/tab-ids";
import { Toast } from "../../shared/ui/Toast";
import { AddPopup } from "./AddPopup";
import { logSoldoutFailure } from "./soldout-log";
import {
  filterByName,
  filterByTab,
  formatPrice,
  sortRecent,
  tabCounts,
  type StatusTab,
} from "./soldout-logic";
import { SOLDOUT_TEXTS as T } from "./soldout-texts";

interface Props {
  api: SoldOutApi;
  /** [메뉴품절] 탭을 누를 때마다(같은 탭 다시 누름 포함) 1씩 커진다. 바뀌면 다시 조회한다 (SPEC 11장 A). */
  refreshSeq: number;
  /** 저장 · 삭제 · 추가 요청이 가는 중인지 알린다. 그동안 메인 탭 이동을 막아 결과 토스트가 사라지지 않게 한다. */
  onBusyChange(busy: boolean): void;
  /** 목록 검색어. 다른 메인 탭에 갔다 와도 남도록 부모(MainContent)가 들고 있는다. */
  query: string;
  onQueryChange(query: string): void;
}

type Load = "loading" | "error" | "ready";

const MODES: SoldOutMode[] = ["temp", "hidden"];

export function SoldOutScreen({
  api,
  refreshSeq,
  onBusyChange,
  query,
  onQueryChange,
}: Props) {
  const [load, setLoad] = useState<Load>("loading");
  const [entries, setEntries] = useState<SoldOutEntry[]>([]);
  const [tab, setTab] = useState<StatusTab>("all");
  // 요청이 가는 중인 줄의 코드. 그 줄의 라디오 · [삭제]를 잠근다.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState<SoldOutEntry | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const [retrySeq, setRetrySeq] = useState(0);
  // 조회 응답이 줄 요청과 엇갈릴 때, 요청 중인 줄은 화면 값을 지키려고 최신 busy를 ref에도 둔다.
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  });
  // 저장 · 삭제 · 추가가 시작하거나 끝날 때마다 커진다. 조회를 보낸 뒤 번호가 바뀌었으면 그 응답은 옛 값이라 버린다.
  const mutations = useRef(0);
  // 같은 문구가 연달아 떠도 시간을 다시 재도록 번호를 key로 쓴다.
  const toastSeq = useRef(0);
  // 화면 뒤에서 하는 조용한 재조회인지(실패해도 목록을 내리지 않는다).
  const silentNext = useRef(false);

  const retry = useCallback(() => {
    setLoad("loading");
    setRetrySeq((n) => n + 1);
  }, []);
  // 서버 값과 화면이 어긋났을 수 있을 때(시간 초과, 추가 건수 부족, 엇갈린 조회) 로딩 표시 없이 다시 읽는다.
  // 이 재조회가 실패하면 목록은 그대로 두고 토스트로만 알린다.
  const refetch = useCallback(() => {
    silentNext.current = true;
    setRetrySeq((n) => n + 1);
  }, []);

  useEffect(() => {
    let current = true;
    const silent = silentNext.current;
    silentNext.current = false;
    const startedAt = mutations.current;
    // async로 감싸, 구현이 Promise 대신 바로 던져도 읽기 실패 길로 간다.
    withTimeout((async () => api.loadList())()).then(
      (list) => {
        if (!current) return;
        if (mutations.current !== startedAt) {
          // 조회를 보낸 뒤 저장이 끝났다면 이 응답은 그 전 값이다: 버리고 새로 읽는다.
          refetch();
          return;
        }
        // 조회 전에 시작해 아직 요청 중인 줄은 지금 화면 값을 지킨다.
        setEntries((cur) =>
          list.map((e) =>
            busyRef.current.has(e.code)
              ? (cur.find((c) => c.code === e.code) ?? e)
              : e,
          ),
        );
        setLoad("ready");
      },
      (error: unknown) => {
        if (!current) return;
        logSoldoutFailure("list", error);
        if (silent) {
          toastSeq.current += 1;
          setToast({ id: toastSeq.current, message: T.loadFailed });
        } else {
          setLoad("error");
        }
      },
    );
    return () => {
      current = false;
    };
  }, [api, refreshSeq, retrySeq, refetch]);

  // 부모가 렌더마다 새 함수를 넘겨도 효과가 다시 돌지 않게 최신 값만 ref에 둔다.
  const onBusyRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyRef.current = onBusyChange;
  });
  const requesting = busy.size > 0 || adding;
  useEffect(() => {
    onBusyRef.current(requesting);
  }, [requesting]);
  // 화면이 내려가면 "요청 중 아님"을 알려 탭 이동 막힘이 남지 않게 한다.
  useEffect(() => () => onBusyRef.current(false), []);

  function showToast(message: string) {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message });
  }
  function lock(code: string, on: boolean) {
    mutations.current += 1;
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }
  function patchMode(code: string, mode: SoldOutMode, onlyIf?: SoldOutMode) {
    setEntries((list) =>
      list.map((e) =>
        e.code === code && (onlyIf === undefined || e.mode === onlyIf)
          ? { ...e, mode }
          : e,
      ),
    );
  }
  // 추가 팝업이 돌려준 항목을 넣는다. 그사이 조회가 같은 코드를 이미 넣었으면 겹치지 않게 뺀다.
  function addEntries(added: SoldOutEntry[]) {
    mutations.current += 1;
    // 검색어가 남아 있으면 방금 추가한 항목이 걸러져 안 보이므로, 실제로 추가됐을 때만 검색어를 지운다.
    if (added.length > 0) onQueryChange("");
    setEntries((list) => [
      ...list.filter((e) => !added.some((a) => a.code === e.code)),
      ...added,
    ]);
  }

  async function changeMode(entry: SoldOutEntry, mode: SoldOutMode) {
    if (busy.has(entry.code) || entry.mode === mode) return;
    const before = entry.mode;
    lock(entry.code, true);
    patchMode(entry.code, mode);
    try {
      await withTimeout((async () => api.setMode(entry.code, mode))());
      void logInfo(logMessages.soldoutModeChanged(entry.code, mode));
      showToast(T.saved);
    } catch (error) {
      logSoldoutFailure("mode", error);
      // 줄 값이 아직 내가 바꾼 값일 때만 되돌린다(다른 경로가 먼저 바꿨다면 덮지 않는다).
      patchMode(entry.code, before, mode);
      if (error instanceof RequestTimeoutError) refetch();
      showToast(T.saveFailed);
    } finally {
      lock(entry.code, false);
    }
  }

  async function remove(entry: SoldOutEntry) {
    setRemoving(null);
    lock(entry.code, true);
    try {
      await withTimeout((async () => api.remove(entry.code))());
      void logInfo(logMessages.soldoutRemoved(entry.code));
      setEntries((list) => list.filter((e) => e.code !== entry.code));
    } catch (error) {
      logSoldoutFailure("remove", error);
      if (error instanceof RequestTimeoutError) refetch();
      showToast(T.saveFailed);
    } finally {
      lock(entry.code, false);
    }
  }

  if (load !== "ready") {
    if (load === "error") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-xl text-gray-700">{T.loadFailed}</p>
          <button
            type="button"
            onClick={retry}
            className="h-14 rounded-xl bg-blue-600 px-8 text-xl font-bold text-white"
          >
            {T.retry}
          </button>
        </div>
      );
    }
    return (
      <p role="status" className="p-8 text-xl text-gray-500">
        {T.loading}
      </p>
    );
  }

  // 탭 건수도 검색 결과 기준이다(주문내역과 같은 방식).
  const searched = filterByName(entries, query);
  const counts = tabCounts(searched);
  const tabs = (["all", "temp", "hidden"] as const).map(
    (id): { id: StatusTab; label: string } => ({
      id,
      label: `${T.tabs[id]} ${counts[id]}`,
    }),
  );
  const rows = sortRecent(filterByTab(searched, tab));

  return (
    <>
      {/* 팝업 · 확인창이 떠 있는 동안 뒤 화면을 터치 · 초점으로 건드리지 못하게 막는다. */}
      <div
        inert={popupOpen || removing !== null}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* 한 줄: 검색칸(남는 폭) · [검색] · [+ 품절 상품 추가]. 1024px에서도 넘치지 않게 오른쪽 둘은 줄어들지 않는 폭이다. */}
        <form
          role="search"
          className="flex items-center gap-3 px-8 pt-6"
          onSubmit={(e) => {
            // 치는 대로 이미 걸러져 있어 다시 적용할 것은 없다. Enter · [검색]은 초점을 빼 화상 키보드를 닫는 것이 일이다.
            e.preventDefault();
            searchRef.current?.blur();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <input
              ref={searchRef}
              type="text"
              aria-label={T.search}
              placeholder={T.search}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="h-12 w-full rounded-xl border border-gray-300 pr-12 pl-4 text-lg"
            />
            {query !== "" && (
              <button
                type="button"
                aria-label={T.clearSearch}
                onClick={() => onQueryChange("")}
                className="absolute top-0 right-0 flex size-12 items-center justify-center text-2xl text-gray-500"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="submit"
            className="h-12 w-24 shrink-0 rounded-xl border border-blue-600 text-lg font-bold text-blue-700"
          >
            {T.searchButton}
          </button>
          <button
            type="button"
            onClick={() => setPopupOpen(true)}
            className="h-12 shrink-0 rounded-xl bg-blue-600 px-6 text-lg font-bold text-white"
          >
            {T.add}
          </button>
        </form>
        <p className="px-8 pt-3 text-lg text-gray-600">{T.guide}</p>
        <div className="mt-3">
          <TabBar<StatusTab>
            label="품절 상태"
            tabs={tabs}
            activeId={tab}
            idPrefix="soldout-status"
            size="sub"
            onSelect={setTab}
          />
        </div>
        <section
          role="tabpanel"
          id={panelId("soldout-status", tab)}
          aria-labelledby={tabId("soldout-status", tab)}
          className="min-h-0 flex-1 overflow-y-auto px-8 pb-6"
        >
          {rows.length === 0 ? (
            <p className="p-8 text-center text-xl text-gray-500">
              {query.trim() === "" ? T.empty : T.noMatch}
            </p>
          ) : (
            <table className="w-full text-left text-lg">
              <thead className="sticky top-0 bg-white text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="py-3">{T.columns.name}</th>
                  <th>{T.columns.kind}</th>
                  <th>{T.columns.category}</th>
                  <th className="text-right">{T.columns.price}</th>
                  <th className="pl-8">{T.columns.mode}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const locked = busy.has(entry.code);
                  return (
                    <tr
                      key={entry.code}
                      className="h-16 border-b border-gray-100"
                    >
                      <td className="font-bold text-gray-900">{entry.name}</td>
                      <td>{T.kind[entry.kind]}</td>
                      <td>{entry.categoryName}</td>
                      <td className="text-right">{formatPrice(entry.price)}</td>
                      <td className="pl-8">
                        <fieldset disabled={locked} className="flex gap-4">
                          <legend className="sr-only">
                            {entry.name} 표시방식
                          </legend>
                          {MODES.map((mode) => (
                            <label
                              key={mode}
                              className="flex min-h-12 items-center gap-2"
                            >
                              <input
                                type="radio"
                                name={`mode-${entry.code}`}
                                checked={entry.mode === mode}
                                onChange={() => void changeMode(entry, mode)}
                                className="size-6"
                              />
                              {T.mode[mode]}
                            </label>
                          ))}
                        </fieldset>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          disabled={locked}
                          aria-label={`${entry.name} ${T.remove}`}
                          onClick={() => setRemoving(entry)}
                          className="h-12 rounded-xl border border-gray-300 px-5 text-lg text-gray-700 disabled:opacity-50"
                        >
                          {T.remove}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
      {removing && (
        <ConfirmDialog
          title={T.confirmRemove.title}
          message={T.confirmRemove.message}
          confirmLabel={T.confirmRemove.confirm}
          cancelLabel={T.confirmRemove.cancel}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
      {popupOpen && (
        <AddPopup
          api={api}
          entries={entries}
          onAdded={addEntries}
          onNotify={showToast}
          onAddingChange={setAdding}
          onRefresh={refetch}
          onClose={() => setPopupOpen(false)}
        />
      )}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
