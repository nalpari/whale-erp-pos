// 주문접수 탭 화면 (SPEC-order-board). 주문 목록과 상태 변경은 T03의 useOrders()가 주고, 이 화면은 보여 주고 버튼만 잇는다.
// 배너는 [주문접수] 탭이 열려 있을 때만 보이므로 배너 상태도 이 화면이 가진다. 다른 탭으로 가면 화면이 내려가 배너도 사라진다 (11장 E).
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Order, OrderAction } from "../../shared/api/orders";
import { ORDER_MESSAGES } from "../../shared/orders/order-texts";
import { useOrders } from "../../shared/orders/orders-context";
import { UNDO_WINDOW_MS } from "../../shared/orders/orders-state";
import { TabBar } from "../../shared/ui/TabBar";
import { Toast } from "../../shared/ui/Toast";
import { panelId } from "../../shared/ui/tab-ids";
import { BottomBanners, type BoardBanner } from "./BottomBanners";
import {
  BOARD_TABS,
  BOARD_TEXTS,
  SORT_LABELS,
  SORT_SELECT_LABEL,
  STATUS_LABELS,
  type BoardTabId,
} from "./board-texts";
import { OrderSummaryDialog } from "../order-summary/OrderSummaryDialog";
import { OrderCard } from "./OrderCard";
import { useOpenRequest } from "../desktop-widget/open-request";
import {
  newlyCustomerCancelled,
  splitOrders,
  startOfDay,
  statusSnapshot,
  type BoardStatus,
  type SortOrder,
  type StatusFilters,
} from "./order-board-logic";
import { loadSort, saveSort } from "./sort-storage";

const CANCEL_BANNER_MS = 5000;
/** 넘침을 잴 때 빼는 값(px). 버튼 묶음 자리로 넘칠 때만 더하는 아래 여백 pb-24(96) - p-3(12)와 함께 바꿔야 한다. */
const PAGER_EXTRA_PADDING = 84;
const FILTER_STATUSES: BoardStatus[] = ["pending", "preparing", "ready"];

export function OrderBoardScreen() {
  const { orders, inFlight, changeStatus } = useOrders();
  const [tab, setTab] = useState<BoardTabId>("board");
  const [sort, setSort] = useState<SortOrder>(loadSort);
  // 필터는 저장하지 않는다. [주문접수] 탭을 열 때마다 모두 체크 (11장 D).
  const [filters, setFilters] = useState<StatusFilters>({
    pending: true,
    preparing: true,
    ready: true,
  });
  const [banners, setBanners] = useState<BoardBanner[]>([]);
  const [toast, setToast] = useState<{ key: number; message: string } | null>(
    null,
  );
  const [overflowing, setOverflowing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // 0시가 지나면 [픽업완료] 탭이 비워지도록 날짜가 바뀔 때만 다시 그린다 (값이 같으면 다시 그리지 않는다).
  const [dayStart, setDayStart] = useState(() => startOfDay(Date.now()));
  useEffect(() => {
    const timer = setInterval(
      () => setDayStart(startOfDay(Date.now())),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);

  // 위젯에서 카드 · 「+ N건 더 있음」을 누르면 [주문접수] 첫 탭을 열고, 주문이 있으면 그 요약 팝업을 연다 (T06 스펙 3.4).
  // 화면 상태는 렌더 중에 맞추고(효과 안 setState 금지), ref를 만지는 일은 효과에서 한다.
  const openRequest = useOpenRequest();
  const widgetRequest = openRequest?.request ?? null;
  const [handledSeq, setHandledSeq] = useState(0);
  if (widgetRequest && widgetRequest.seq !== handledSeq) {
    setHandledSeq(widgetRequest.seq);
    setTab("board");
    // 필터가 꺼져 있으면 연 주문의 카드가 안 보이므로 모두 켠다.
    setFilters({ pending: true, preparing: true, ready: true });
    if (widgetRequest.orderId) setOpenId(widgetRequest.orderId);
  }
  // 팝업을 닫은 뒤 이 카드가 보이게 화면을 옮길 주문.
  const scrollBackTo = useRef<string | null>(null);
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (!widgetRequest) return;
    // 위젯에서 같은 주문을 다시 열면 「사라짐」 알림이 다시 나올 수 있게 비운다.
    notified.current = null;
    scrollBackTo.current = widgetRequest.orderId ?? null;
    openRequest?.consume(widgetRequest.seq);
  }, [widgetRequest, openRequest]);

  // 버튼 핸들러가 카드를 다시 그리게 만들지 않도록 최신 값은 ref로 읽는다.
  const latest = useRef({ orders, changeStatus });
  useEffect(() => {
    latest.current = { orders, changeStatus };
  });
  // 이 PC가 [주문취소]를 보낸 주문. 그 성공으로 팝업이 닫힐 때는 「다른 PC」 안내를 띄우지 않는다.
  const ownCancel = useRef<string | null>(null);
  const padded = useRef(false);
  const bannerSeq = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);

  const addBanner = useCallback((order: Order, kind: BoardBanner["kind"]) => {
    bannerSeq.current += 1;
    setBanners((list) => [
      ...list,
      {
        id: `banner-${bannerSeq.current}`,
        kind,
        orderId: order.orderId,
        pickupNumber: order.pickupNumber,
        expiresAt:
          Date.now() + (kind === "pickup" ? UNDO_WINDOW_MS : CANCEL_BANNER_MS),
      },
    ]);
  }, []);
  const removeBanner = useCallback(
    (id: string) => setBanners((list) => list.filter((b) => b.id !== id)),
    [],
  );
  const showToast = useCallback((message: string) => {
    setToast((t) => ({ key: (t?.key ?? 0) + 1, message }));
  }, []);

  // 실패 문구는 T03이 준 것을 그대로 토스트로 보이고, 앞에 「#번호 」를 붙인다 (2.6). 요약 팝업의 실패도 같은 길로 온다.
  const reportFailure = useCallback(
    (orderId: string, message: string) => {
      const order = latest.current.orders.find((o) => o.orderId === orderId);
      showToast(
        order ? BOARD_TEXTS.failureToast(order.pickupNumber, message) : message,
      );
    },
    [showToast],
  );
  const run = useCallback(
    async (orderId: string, action: Exclude<OrderAction, "cancel">) => {
      let result: Awaited<ReturnType<typeof latest.current.changeStatus>>;
      try {
        result = await latest.current.changeStatus(orderId, action);
      } catch {
        // 던지지 않는 계약이지만 던져도 점원에게는 실패로 보인다 (카드 버튼 · 요약 팝업 공통).
        reportFailure(orderId, ORDER_MESSAGES.failed);
        return false;
      }
      if (result.ok) return true;
      // 문구 없는 거절은 [완료 취소]일 때만 실패 문구를 보인다: 5초가 끝나는 순간 누르면 T03이 서버에 보내지 않고 거절하는데
      // 점원은 되돌렸다고 믿기 때문이다 (order-sync 11장 F). 다른 버튼은 요청 중에 이미 막혀 있어 조용히 넘긴다.
      const message =
        "message" in result
          ? result.message
          : action === "undo-pickup"
            ? ORDER_MESSAGES.failed
            : null;
      if (message) reportFailure(orderId, message);
      return false;
    },
    [reportFailure],
  );
  const handleAction = useCallback(
    async (orderId: string, action: Exclude<OrderAction, "cancel">) => {
      const ok = await run(orderId, action);
      const order = latest.current.orders.find((o) => o.orderId === orderId);
      if (ok && action === "pickup" && order) addBanner(order, "pickup");
      return ok;
    },
    [run, addBanner],
  );
  const handleUndo = useCallback(
    async (banner: BoardBanner) => {
      if (await run(banner.orderId, "undo-pickup")) removeBanner(banner.id);
    },
    [run, removeBanner],
  );

  // 접수대기였던 주문이 고객취소로 바뀌는 것만 배너로 알린다. 화면을 열 때 이미 취소돼 있던 주문은 알리지 않는다 (2.7).
  // 알림음은 다른 탭에서도 울려야 하므로 항상 떠 있는 CustomerCancelSound가 낸다.
  const previous = useRef<Map<string, Order["status"]> | null>(null);
  if (previous.current === null) previous.current = statusSnapshot(orders);
  useEffect(() => {
    for (const o of newlyCustomerCancelled(
      previous.current ?? new Map(),
      orders,
    )) {
      addBanner(o, "customer-cancel");
    }
    previous.current = statusSnapshot(orders);
  }, [orders, addBanner]);

  const lingering = useMemo(
    () =>
      new Set(banners.filter((b) => b.kind === "pickup").map((b) => b.orderId)),
    [banners],
  );
  // splitOrders의 now는 날짜(0시) 계산에만 쓰므로 오늘 0시를 넘겨 분마다 다시 계산되지 않게 한다.
  const { board, pickedUp, counts } = useMemo(
    () => splitOrders(orders, { sort, filters, now: dayStart, lingering }),
    [orders, sort, filters, dayStart, lingering],
  );
  const list = tab === "board" ? board : pickedUp;
  // 열린 동안 목록에서 사라지거나(예: 다시 조회한 응답에 없음) 취소로 바뀌면 팝업(과 취소 사유 팝업)이 같이 닫힌다 (2.5).
  // 고객 취소 배너는 위의 고객 취소 감지가 그대로 띄운다.
  const found = openId ? orders.find((o) => o.orderId === openId) : undefined;
  const openOrder =
    found &&
    found.status !== "store-cancelled" &&
    found.status !== "customer-cancelled"
      ? found
      : undefined;
  // 누르지 않았는데 팝업이 사라지면, 고객 취소(배너가 알린다)가 아닐 때 이유를 알린다 (사용자 결정 B-2).
  // openId는 지우지 않는다(효과 안 setState 금지): 같은 id로 두 번 알리지 않게 notified로 막고, 카드를 새로 누를 때 다시 비운다. (0시 정리로 지워진 주문이 응답에 다시 들어오면 팝업이 다시 열릴 수 있으나, 서버 응답이 앞뒤가 안 맞을 때뿐이다.)
  useEffect(() => {
    if (!openId || openOrder || notified.current === openId) return;
    notified.current = openId;
    if (
      found?.status !== "customer-cancelled" &&
      ownCancel.current !== openId
    ) {
      reportFailure(openId, ORDER_MESSAGES.alreadyHandled);
    }
    ownCancel.current = null;
  }, [openId, openOrder, found, reportFailure]);

  // [이전] [다음]은 카드가 한 화면을 넘을 때만 보인다 (Q23).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // 버튼용 여백은 내용이 아니므로 빼고 잰다. 안 빼면 여백 때문에 넘친다고 판단해 계속 켜진다.
    const measure = () => {
      const extra = padded.current ? PAGER_EXTRA_PADDING : 0;
      const next = el.scrollHeight - extra > el.clientHeight + 1;
      padded.current = next;
      setOverflowing(next);
    };
    measure();
    window.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [tab, list.length, banners.length]);

  const page = (direction: 1 | -1) => {
    const el = scroller.current;
    el?.scrollBy({ top: direction * el.clientHeight, behavior: "smooth" });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar<BoardTabId>
        label="주문접수 보기"
        tabs={BOARD_TABS}
        activeId={tab}
        idPrefix="board"
        size="sub"
        onSelect={setTab}
      />
      <div
        role="tabpanel"
        id={panelId("board", tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === "board" && (
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b border-gray-200 px-4 py-1">
            <label className="flex items-center gap-2 text-lg">
              <span className="sr-only">{SORT_SELECT_LABEL}</span>
              <select
                aria-label={SORT_SELECT_LABEL}
                value={sort}
                onChange={(e) => {
                  const next = e.target.value as SortOrder;
                  setSort(next);
                  saveSort(next);
                }}
                className="min-h-12 rounded border border-gray-300 bg-white px-3"
              >
                {(Object.keys(SORT_LABELS) as SortOrder[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            {FILTER_STATUSES.map((status) => (
              <label
                key={status}
                className="flex min-h-12 items-center gap-2 text-lg"
              >
                <input
                  type="checkbox"
                  checked={filters[status]}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, [status]: e.target.checked }))
                  }
                  className="size-6"
                />
                {STATUS_LABELS[status]} {counts[status]}
              </label>
            ))}
          </div>
        )}
        <div className="relative min-h-0 flex-1">
          <div
            key={tab}
            ref={scroller}
            className={`h-full overflow-y-auto p-3 ${overflowing ? "pb-24" : ""}`}
          >
            {list.length === 0 ? (
              <p className="flex h-full items-center justify-center text-2xl text-gray-400">
                {tab === "board"
                  ? BOARD_TEXTS.emptyBoard
                  : BOARD_TEXTS.emptyPickedUp}
              </p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,300px)] justify-start gap-3">
                {list.map((order) => (
                  <OrderCard
                    key={order.orderId}
                    order={order}
                    busy={!!inFlight[order.orderId]}
                    onAction={handleAction}
                    onOpen={(id) => {
                      notified.current = null;
                      setOpenId(id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          {overflowing && (
            <div className="absolute right-4 bottom-4 flex gap-2">
              {([-1, 1] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => page(direction)}
                  className="min-h-14 min-w-24 rounded-lg bg-gray-800/90 px-5 text-xl font-bold text-white"
                >
                  {direction === -1 ? BOARD_TEXTS.prev : BOARD_TEXTS.next}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <BottomBanners
        banners={banners}
        inFlight={inFlight}
        onExpire={removeBanner}
        onUndo={handleUndo}
      />
      {openOrder && (
        <OrderSummaryDialog
          key={openOrder.orderId}
          order={openOrder}
          busy={!!inFlight[openOrder.orderId]}
          // 요청이 끝나기 전에 다른 카드를 열었다면 그 팝업을 닫지 않도록 이 주문의 팝업일 때만 닫는다.
          onClose={() => {
            ownCancel.current = null;
            setOpenId((id) => (id === openOrder.orderId ? null : id));
            const target = scrollBackTo.current;
            scrollBackTo.current = null;
            if (target === openOrder.orderId) {
              // 팝업이 사라져 화면이 다시 그려진 뒤에 옮긴다.
              requestAnimationFrame(() =>
                document
                  .querySelector(`[data-order-id="${CSS.escape(target)}"]`)
                  ?.scrollIntoView?.({ block: "nearest" }),
              );
            }
          }}
          onAction={handleAction}
          onError={(id, message) => {
            ownCancel.current = null; // 실패했으니 이 PC가 취소한 것이 아니다
            reportFailure(id, message);
          }}
          onCancelRequest={(id) => {
            ownCancel.current = id;
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
