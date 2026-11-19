// 품절상품 추가 팝업 (SPEC-soldout 4장). [추가하기]는 바로 일시품절로 저장하고 팝업은 [닫기]까지 유지한다.
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Catalog,
  SoldOutApi,
  SoldOutEntry,
} from "../../shared/api/soldout";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { TabBar } from "../../shared/ui/TabBar";
import { panelId, tabId } from "../../shared/ui/tab-ids";
import { logSoldoutFailure } from "./soldout-log";
import {
  categoryTab,
  filterCatalog,
  formatPrice,
  registeredCodes,
  type CategoryTab,
} from "./soldout-logic";
import { SOLDOUT_TEXTS as T } from "./soldout-texts";

interface Props {
  api: SoldOutApi;
  /** 지금 품절로 등록된 항목. 이 코드는 고를 수 없다. */
  entries: SoldOutEntry[];
  /** 추가에 성공한 항목을 뒤 화면 목록에 넣는다. */
  onAdded(added: SoldOutEntry[]): void;
  onNotify(message: string): void;
  /** [추가하기] 요청이 가는 중인지 알린다. 그동안 메인 탭 이동을 막는다. */
  onAddingChange(adding: boolean): void;
  /** 요청한 것보다 적게 추가됐을 때(다른 곳에서 먼저 등록) 뒤 목록을 서버 기준으로 다시 읽는다. */
  onRefresh(): void;
  onClose(): void;
}

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; catalog: Catalog };

export function AddPopup({
  api,
  entries,
  onAdded,
  onNotify,
  onAddingChange,
  onRefresh,
  onClose,
}: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reloadSeq, setReloadSeq] = useState(0);
  // 검색어 · 카테고리 · 체크는 이 팝업이 내려가면 함께 사라진다 (스펙 4장).
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryTab>("all");
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 부모가 렌더마다 새 함수를 넘겨도 아래 효과가 다시 돌지 않게 최신 값만 ref에 둔다.
  const onAddingRef = useRef(onAddingChange);
  useEffect(() => {
    onAddingRef.current = onAddingChange;
  });
  useEffect(() => {
    onAddingRef.current(adding);
  }, [adding]);
  // 팝업이 내려가면 "추가 중 아님"을 알려 탭 이동 막힘이 남지 않게 한다.
  useEffect(() => () => onAddingRef.current(false), []);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setReloadSeq((n) => n + 1);
  }, []);

  useEffect(() => {
    let current = true;
    withTimeout((async () => api.loadCatalog())()).then(
      (catalog) => {
        if (current) setLoad({ status: "ready", catalog });
      },
      (error: unknown) => {
        if (!current) return;
        logSoldoutFailure("catalog", error);
        setLoad({ status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [api, reloadSeq]);

  // 처음 초점은 팝업 자체에 둔다(검색칸에 두면 터치 PC에서 화상 키보드가 바로 뜬다). 닫히면 열기 전 자리로 돌린다.
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
      if (event.key === "Escape" && !adding) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [adding, onClose]);

  async function submit() {
    if (adding || checked.size === 0) return;
    const codes = [...checked];
    setAdding(true);
    try {
      const added = await withTimeout((async () => api.add(codes))());
      void logInfo(logMessages.soldoutAdded(added.map((e) => e.code)));
      onAdded(added);
      if (added.length < codes.length) onRefresh();
      setChecked(new Set());
      const skipped = codes.length - added.length;
      onNotify(
        skipped <= 0
          ? T.popup.added(added.length)
          : added.length === 0
            ? T.popup.allSkipped(skipped)
            : T.popup.addedPartial(added.length, skipped),
      );
    } catch (error) {
      // 체크는 그대로 둬서 바로 다시 누를 수 있게 한다.
      logSoldoutFailure("add", error);
      // 시간 초과는 서버가 늦게 저장했을 수 있어, 뒤 목록을 서버 기준으로 다시 읽는다.
      if (error instanceof RequestTimeoutError) onRefresh();
      onNotify(T.saveFailed);
    } finally {
      setAdding(false);
    }
  }

  function toggle(code: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  }

  let body;
  if (load.status === "ready") {
    const registered = registeredCodes(entries);
    const items = filterCatalog(load.catalog.items, category, query);
    const tabs: { id: CategoryTab; label: string }[] = [
      { id: "all", label: T.popup.allTab },
      ...load.catalog.categories.map((c) => ({
        id: categoryTab(c.code),
        label: c.name,
      })),
      { id: "option", label: T.popup.optionTab },
    ];
    body = (
      <>
        <div className="px-8">
          <input
            type="search"
            aria-label={T.popup.search}
            placeholder={T.popup.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-14 w-full rounded-xl border border-gray-300 px-4 text-xl"
          />
        </div>
        <div className="mt-4 overflow-x-auto">
          <TabBar<CategoryTab>
            label="카테고리"
            tabs={tabs}
            activeId={category}
            idPrefix="soldout-cat"
            size="sub"
            onSelect={setCategory}
          />
        </div>
        <section
          role="tabpanel"
          id={panelId("soldout-cat", category)}
          aria-labelledby={tabId("soldout-cat", category)}
          className="min-h-0 flex-1 overflow-y-auto px-8"
        >
          {items.length === 0 ? (
            <p className="p-8 text-center text-xl text-gray-500">
              {T.popup.empty}
            </p>
          ) : (
            <ul>
              {items.map((item) => {
                const isRegistered = registered.has(item.code);
                return (
                  <li
                    key={item.code}
                    className="flex min-h-16 items-center gap-4 border-b border-gray-100 text-lg"
                  >
                    <label className="flex min-h-12 flex-1 items-center gap-3 font-bold text-gray-900">
                      <input
                        type="checkbox"
                        checked={checked.has(item.code)}
                        disabled={isRegistered || adding}
                        onChange={() => toggle(item.code)}
                        className="size-7"
                      />
                      {item.name}
                    </label>
                    {isRegistered && (
                      <span className="rounded bg-gray-200 px-2 py-1 text-base text-gray-600">
                        {T.popup.registered}
                      </span>
                    )}
                    <span className="w-16">{T.kind[item.kind]}</span>
                    <span className="w-24">{item.categoryName}</span>
                    <span className="w-24 text-right">
                      {formatPrice(item.price)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </>
    );
  } else if (load.status === "error") {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-xl text-gray-700">{T.popup.loadFailed}</p>
        <button
          type="button"
          onClick={retry}
          className="h-14 rounded-xl bg-blue-600 px-8 text-xl font-bold text-white"
        >
          {T.retry}
        </button>
      </div>
    );
  } else {
    body = (
      <p role="status" className="p-8 text-xl text-gray-500">
        {T.popup.loading}
      </p>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        // 바깥을 눌러도 닫힌다. 팝업 안쪽 눌림은 target이 달라 걸러진다.
        if (e.target === e.currentTarget && !adding) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={T.popup.title}
        tabIndex={-1}
        className="flex h-[min(44rem,calc(100vh-2rem))] w-[56rem] max-w-[calc(100vw-2rem)] flex-col gap-0 rounded-2xl bg-white pt-8 shadow-xl outline-none"
      >
        <h2 className="px-8 pb-4 text-2xl font-bold text-gray-900">
          {T.popup.title}
        </h2>
        {body}
        <div className="flex items-center justify-between gap-4 border-t border-gray-200 px-8 py-4">
          <p role="status" className="text-xl text-gray-700">
            {T.popup.selected(checked.size)}
          </p>
          <div className="flex gap-4">
            <button
              type="button"
              disabled={adding}
              onClick={onClose}
              className="h-16 w-36 rounded-xl border border-gray-300 text-xl text-gray-700 disabled:opacity-50"
            >
              {T.popup.close}
            </button>
            <button
              type="button"
              disabled={adding || checked.size === 0}
              onClick={() => void submit()}
              className="h-16 w-48 rounded-xl bg-blue-600 text-xl font-bold text-white disabled:opacity-50"
            >
              {adding ? T.popup.submitting : T.popup.submit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
