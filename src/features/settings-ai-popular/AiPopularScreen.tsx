// 환경설정 [AI챗봇 인기메뉴 설정] 화면 (SPEC-settings-ai-popular). 탭을 누를 때마다 서버에서 읽고, 추가 · 삭제는 바로 저장한다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PopularApi, PopularEntry } from "../../shared/api/popular";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Toast } from "../../shared/ui/Toast";
import { AddPopup, type AddPopupTexts } from "../soldout/AddPopup";
import { formatPrice } from "../soldout/soldout-logic";
import { logPopularFailure } from "./popular-log";
import { canPick, remainingSlots, sortOldestFirst } from "./popular-logic";
import { POPULAR_TEXTS as T } from "./popular-texts";

interface Props {
  api: PopularApi;
  /** 웨일ERP 계정만 true. false면 목록만 보이고 [+ 인기상품 추가] · [삭제]는 숨긴다 (SPEC 11장 A). */
  canEdit: boolean;
  /** [AI챗봇 인기메뉴 설정] 탭을 누를 때마다(같은 탭 다시 누름 포함) 1씩 커진다. 바뀌면 다시 조회한다. */
  refreshSeq: number;
  /** 추가 · 삭제 요청이 가는 중인지 알린다. 그동안 메인 탭 · 환경설정 하위 탭 이동을 막는다. */
  onBusyChange(busy: boolean): void;
}

type Load = "loading" | "error" | "ready";

const POPUP_TEXTS: AddPopupTexts = {
  ...T.popup,
  retry: T.retry,
  saveFailed: T.saveFailed,
};

export function AiPopularScreen({
  api,
  canEdit,
  refreshSeq,
  onBusyChange,
}: Props) {
  const [load, setLoad] = useState<Load>("loading");
  const [entries, setEntries] = useState<PopularEntry[]>([]);
  const [removingBusy, setRemovingBusy] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [removing, setRemoving] = useState<PopularEntry | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const [retrySeq, setRetrySeq] = useState(0);
  const toastSeq = useRef(0);
  // 조용한 재조회가 실패했을 때 목록이 아직 없으면(로딩 · 오류 화면) 토스트 대신 오류 화면으로 보낸다.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  // 저장이 시작하거나 끝날 때마다 커진다. 조회를 보낸 뒤 번호가 바뀌었으면 그 응답은 옛 값이라 버리고 다시 읽는다.
  const mutations = useRef(0);
  // 화면 뒤에서 하는 조용한 재조회인지(실패해도 목록을 내리지 않는다).
  const silentNext = useRef(false);

  const retry = useCallback(() => {
    setLoad("loading");
    setRetrySeq((n) => n + 1);
  }, []);
  // 서버 값과 화면이 어긋났을 수 있을 때(시간 초과, 추가 건수 부족, 엇갈린 조회) 로딩 표시 없이 다시 읽는다.
  const refetch = useCallback(() => {
    silentNext.current = true;
    setRetrySeq((n) => n + 1);
  }, []);

  useEffect(() => {
    let current = true;
    const silent = silentNext.current;
    silentNext.current = false;
    const startedAt = mutations.current;
    withTimeout((async () => api.loadList())()).then(
      (list) => {
        if (!current) return;
        if (mutations.current !== startedAt) {
          refetch();
          return;
        }
        setEntries(list);
        setLoad("ready");
      },
      (error: unknown) => {
        if (!current) return;
        logPopularFailure("list", error);
        if (silent && loadRef.current === "ready") {
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

  const onBusyRef = useRef(onBusyChange);
  useEffect(() => {
    onBusyRef.current = onBusyChange;
  });
  const requesting = removingBusy.size > 0 || adding;
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
    setRemovingBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }
  function addEntries(added: PopularEntry[]) {
    mutations.current += 1;
    setEntries((list) => [
      ...list.filter((e) => !added.some((a) => a.code === e.code)),
      ...added,
    ]);
  }

  async function remove(entry: PopularEntry) {
    setRemoving(null);
    lock(entry.code, true);
    try {
      await withTimeout((async () => api.remove(entry.code))());
      void logInfo(logMessages.popularRemoved(entry.code));
      setEntries((list) => list.filter((e) => e.code !== entry.code));
    } catch (error) {
      logPopularFailure("remove", error);
      // 시간 초과는 서버가 늦게 지웠을 수 있어 서버 기준으로 다시 읽는다.
      if (error instanceof RequestTimeoutError) refetch();
      showToast(T.saveFailed);
    } finally {
      lock(entry.code, false);
    }
  }

  // 삭제 결과 토스트가 로딩 · 오류 화면에서도 보이게 모든 갈래에서 같이 그린다.
  const toastEl = toast && (
    <Toast
      key={toast.id}
      message={toast.message}
      onClose={() => setToast(null)}
    />
  );
  if (load !== "ready") {
    if (load === "error") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          {toastEl}
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
      <>
        <p role="status" className="p-8 text-xl text-gray-500">
          {T.loading}
        </p>
        {toastEl}
      </>
    );
  }

  const rows = sortOldestFirst(entries);
  const remaining = remainingSlots(entries.length);

  return (
    <>
      {/* 팝업 · 확인창이 떠 있는 동안 뒤 화면을 터치 · 초점으로 건드리지 못하게 막는다. */}
      <div
        inert={popupOpen || removing !== null}
        className="flex min-h-0 flex-1 flex-col"
      >
        {!canEdit && (
          <p className="mx-8 mt-6 rounded-xl bg-gray-100 px-4 py-3 text-lg text-gray-700">
            {T.readOnly}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 px-8 pt-6">
          <p className="text-lg text-gray-600">{T.guide}</p>
          {canEdit && (
            <button
              type="button"
              disabled={remaining === 0 || requesting}
              onClick={() => setPopupOpen(true)}
              className="h-12 shrink-0 rounded-xl bg-blue-600 px-6 text-lg font-bold text-white disabled:opacity-50"
            >
              {T.add}
            </button>
          )}
        </div>
        <p className="px-8 pt-3 text-lg font-bold text-gray-900">
          {T.count(entries.length)}
        </p>
        <section className="min-h-0 flex-1 overflow-y-auto px-8 pb-6">
          {rows.length === 0 ? (
            <p className="p-8 text-center text-xl text-gray-500">{T.empty}</p>
          ) : (
            <table className="w-full text-left text-lg">
              <thead className="sticky top-0 bg-white text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="py-3">{T.columns.name}</th>
                  <th>{T.columns.category}</th>
                  <th className="text-right">{T.columns.price}</th>
                  <th className="pl-8" />
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const locked = removingBusy.has(entry.code);
                  return (
                    <tr
                      key={entry.code}
                      className="h-16 border-b border-gray-100"
                    >
                      <td className="font-bold text-gray-900">{entry.name}</td>
                      <td>{entry.categoryName}</td>
                      <td className="text-right">{formatPrice(entry.price)}</td>
                      <td className="pl-8">
                        {entry.soldOutMode && (
                          <span className="rounded bg-gray-200 px-2 py-1 text-base text-gray-600">
                            {T.tag[entry.soldOutMode]}
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        {canEdit && (
                          <button
                            type="button"
                            disabled={locked}
                            aria-label={`${entry.name} ${T.remove}`}
                            onClick={() => setRemoving(entry)}
                            className="h-12 rounded-xl border border-gray-300 px-5 text-lg text-gray-700 disabled:opacity-50"
                          >
                            {T.remove}
                          </button>
                        )}
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
          loadCatalog={() => api.loadCatalog()}
          add={(codes) => api.add(codes)}
          registered={new Set(entries.map((e) => e.code))}
          texts={POPUP_TEXTS}
          canPick={canPick}
          tagOf={(item) => (item.soldOutMode ? T.tag[item.soldOutMode] : null)}
          maxPick={remaining}
          log={{
            failure: logPopularFailure,
            added: (codes) => void logInfo(logMessages.popularAdded(codes)),
          }}
          onAdded={addEntries}
          onNotify={showToast}
          onAddingChange={setAdding}
          onRefresh={refetch}
          onClose={() => setPopupOpen(false)}
        />
      )}
      {toastEl}
    </>
  );
}
