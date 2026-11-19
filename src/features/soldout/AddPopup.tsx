// 상품 추가 팝업. 메뉴품절(SPEC-soldout 4장)과 AI챗봇 인기메뉴(SPEC-settings-ai-popular 4장)가 같이 쓴다.
// [추가하기]는 바로 저장하고 팝업은 [닫기]까지 유지한다. 탭 구성 · 고를 수 있는지 · 한도 · 문구는 부르는 쪽이 정한다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Catalog, CatalogItem } from "../../shared/api/soldout";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { TabBar } from "../../shared/ui/TabBar";
import { panelId, tabId } from "../../shared/ui/tab-ids";
import {
  categoryTab,
  filterCatalog,
  formatPrice,
  type CategoryTab,
} from "./soldout-logic";

export interface AddPopupTexts {
  title: string;
  search: string;
  searchPlaceholder: string;
  allTab: string;
  /** 없으면 [옵션] 탭을 두지 않는다. */
  optionTab?: string;
  /** 있으면 각 줄에 메뉴 · 옵션 구분을 보인다. */
  kind?: Record<CatalogItem["kind"], string>;
  registered: string;
  /** maxMore가 있으면 한도가 있는 팝업이다. 지금 선택한 만큼을 뺀 남은 수를 받는다. */
  selected(n: number, maxMore?: number): string;
  submit: string;
  submitting: string;
  close: string;
  added(n: number): string;
  addedPartial(n: number, skipped: number): string;
  allSkipped(skipped: number): string;
  /** 한도가 다 찼을 때 팝업 아래에 보인다. */
  limitReached?: string;
  empty: string;
  loading: string;
  loadFailed: string;
  retry: string;
  saveFailed: string;
}

interface Props<A extends { code: string }> {
  loadCatalog(): Promise<Catalog>;
  /** 서버가 실제로 추가한 항목을 돌려준다. */
  add(codes: string[]): Promise<A[]>;
  /** 이미 등록된 코드. 이 코드는 고를 수 없고 「등록됨」을 보인다. */
  registered: ReadonlySet<string>;
  texts: AddPopupTexts;
  /** 고를 수 없는 상품(체크 막힘). 기본은 모두 고른다. */
  canPick?(item: CatalogItem): boolean;
  /** 이름 옆 꼬리표. */
  tagOf?(item: CatalogItem): string | null;
  /** 더 고를 수 있는 최대 개수(남은 자리). 없으면 한도 없음. */
  maxPick?: number;
  /** 실패 · 성공 로그. 코드와 건수만 남긴다. */
  log: {
    failure(action: "catalog" | "add", error: unknown): void;
    added(codes: string[]): void;
  };
  /** 추가에 성공한 항목을 뒤 화면 목록에 넣는다. */
  onAdded(added: A[]): void;
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

export function AddPopup<A extends { code: string }>({
  loadCatalog,
  add,
  registered,
  texts: T,
  canPick,
  tagOf,
  maxPick,
  log,
  onAdded,
  onNotify,
  onAddingChange,
  onRefresh,
  onClose,
}: Props<A>) {
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
  // 부모가 렌더마다 새 함수를 넘겨도 조회가 다시 나가지 않게 최신 값만 ref에 둔다.
  const loadRef = useRef(loadCatalog);
  const addRef = useRef(add);
  const logRef = useRef(log);
  useEffect(() => {
    loadRef.current = loadCatalog;
    addRef.current = add;
    logRef.current = log;
  });

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setReloadSeq((n) => n + 1);
  }, []);

  useEffect(() => {
    let current = true;
    withTimeout((async () => loadRef.current())()).then(
      (catalog) => {
        if (current) setLoad({ status: "ready", catalog });
      },
      (error: unknown) => {
        if (!current) return;
        logRef.current.failure("catalog", error);
        setLoad({ status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [reloadSeq]);

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
      const added = await withTimeout((async () => addRef.current(codes))());
      logRef.current.added(added.map((e) => e.code));
      onAdded(added);
      if (added.length < codes.length) onRefresh();
      setChecked(new Set());
      const skipped = codes.length - added.length;
      onNotify(
        skipped <= 0
          ? T.added(added.length)
          : added.length === 0
            ? T.allSkipped(skipped)
            : T.addedPartial(added.length, skipped),
      );
    } catch (error) {
      // 체크는 그대로 둬서 바로 다시 누를 수 있게 한다.
      logRef.current.failure("add", error);
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
    const items = filterCatalog(load.catalog.items, category, query);
    const tabs: { id: CategoryTab; label: string }[] = [
      { id: "all", label: T.allTab },
      ...load.catalog.categories.map((c) => ({
        id: categoryTab(c.code),
        label: c.name,
      })),
      ...(T.optionTab ? [{ id: "option" as const, label: T.optionTab }] : []),
    ];
    body = (
      <>
        <div className="px-8">
          <input
            type="search"
            aria-label={T.search}
            placeholder={T.searchPlaceholder}
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
            <p className="p-8 text-center text-xl text-gray-500">{T.empty}</p>
          ) : (
            <ul>
              {items.map((item) => {
                const isRegistered = registered.has(item.code);
                return (
                  <li
                    key={item.code}
                    className="flex min-h-16 items-center gap-4 border-b border-gray-100 text-lg"
                  >
                    <label
                      className={`flex min-h-12 flex-1 items-center gap-3 font-bold ${
                        isRegistered || (canPick && !canPick(item))
                          ? "text-gray-400"
                          : "text-gray-900"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(item.code)}
                        disabled={
                          isRegistered ||
                          adding ||
                          (canPick !== undefined && !canPick(item)) ||
                          (maxPick !== undefined &&
                            checked.size >= maxPick &&
                            !checked.has(item.code))
                        }
                        onChange={() => toggle(item.code)}
                        className="size-7"
                      />
                      {item.name}
                    </label>
                    {isRegistered && (
                      <span className="rounded bg-gray-200 px-2 py-1 text-base text-gray-600">
                        {T.registered}
                      </span>
                    )}
                    {tagOf?.(item) && (
                      <span className="rounded bg-gray-200 px-2 py-1 text-base text-gray-600">
                        {tagOf(item)}
                      </span>
                    )}
                    {T.kind && (
                      <span className="w-16">{T.kind[item.kind]}</span>
                    )}
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
  } else {
    body = (
      <p role="status" className="p-8 text-xl text-gray-500">
        {T.loading}
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
        aria-label={T.title}
        tabIndex={-1}
        className="flex h-[min(44rem,calc(100vh-2rem))] w-[56rem] max-w-[calc(100vw-2rem)] flex-col gap-0 rounded-2xl bg-white pt-8 shadow-xl outline-none"
      >
        <h2 className="px-8 pb-4 text-2xl font-bold text-gray-900">
          {T.title}
        </h2>
        {body}
        <div className="flex items-center justify-between gap-4 border-t border-gray-200 px-8 py-4">
          <div>
            <p role="status" className="text-xl text-gray-700">
              {T.selected(
                checked.size,
                maxPick === undefined
                  ? undefined
                  : Math.max(maxPick - checked.size, 0),
              )}
            </p>
            {maxPick !== undefined &&
              (maxPick === 0 || checked.size > maxPick) &&
              T.limitReached && (
                <p role="status" className="text-lg text-gray-600">
                  {T.limitReached}
                </p>
              )}
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              disabled={adding}
              onClick={onClose}
              className="h-16 w-36 rounded-xl border border-gray-300 text-xl text-gray-700 disabled:opacity-50"
            >
              {T.close}
            </button>
            <button
              type="button"
              disabled={
                adding ||
                checked.size === 0 ||
                (maxPick !== undefined && checked.size > maxPick)
              }
              onClick={() => void submit()}
              className="h-16 w-48 rounded-xl bg-blue-600 text-xl font-bold text-white disabled:opacity-50"
            >
              {adding ? T.submitting : T.submit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
