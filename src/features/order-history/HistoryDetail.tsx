// 주문내역 상세 (SPEC-order-history 3장). 상태 버튼은 T05 요약 팝업과 같은 규칙 · 같은 길(changeStatus, 취소 사유 팝업)이다.
// 접수대기 · 제조중 · 제조완료 주문은 [주문접수] 탭의 같은 주문과 한 상태를 보인다: useOrders() 목록이 더 새로우면 그 상태를 쓴다.
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  HistoryOrder,
  OrderHistoryApi,
} from "../../shared/api/order-history";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { errorSummary } from "../../shared/error-summary";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { ORDER_MESSAGES } from "../../shared/orders/order-texts";
import { isCancelledStatus } from "../../shared/api/orders";
import { usePrintForms } from "../print-forms/print-forms-context";
import { PRINT_TEXTS } from "../print-forms/print-texts";
import { ReceiptPreviewDialog } from "../print-forms/ReceiptPreviewDialog";
import { useOrders } from "../../shared/orders/orders-context";
import { BOARD_TEXTS } from "../order-board/board-texts";
import { pickupSchedule } from "../order-board/order-board-logic";
import { CancelReasonDialog } from "../order-summary/CancelReasonDialog";
import { RemakeDialog } from "../order-summary/RemakeDialog";
import {
  formatDateTime,
  formatPhone,
  summaryButtons,
} from "../order-summary/summary-logic";
import {
  formatWon,
  historyEntries,
  lineTotal,
  orderCountLabel,
} from "./history-logic";
import { DISCOUNT_LABELS, HISTORY_TEXTS, STATUS_VIEW } from "./history-texts";

interface Props {
  /** [주문내역] 탭을 누를 때마다 오른다. 바뀌면 상세를 다시 불러온다. */
  refreshSeq: number;
  orderId: string;
  api: OrderHistoryApi;
  /** [← 이전]. 목록 조건 · 페이지 · 스크롤은 부르는 쪽이 지킨다. */
  onBack(): void;
  /** 이 PC에서 상태를 바꿨다. 목록을 다시 조회하게 한다. */
  onChanged(): void;
  /** 「#12 …」 토스트. */
  onToast(message: string): void;
}

const BUTTON = "min-h-14 rounded-xl px-5 text-xl font-bold disabled:opacity-50";
const GRAY = `${BUTTON} border border-gray-300 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-400`;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-gray-200 p-4"
    >
      <h3 className="mb-2 text-lg font-bold text-gray-700">{title}</h3>
      {children}
    </section>
  );
}

export function HistoryDetail({
  refreshSeq,
  orderId,
  api,
  onBack,
  onChanged,
  onToast,
}: Props) {
  const { orders, inFlight, changeStatus } = useOrders();
  const [detail, setDetail] = useState<HistoryOrder | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [remakeOpen, setRemakeOpen] = useState(false);
  // 상세를 연 시각. 0시를 넘겨 열려 있으면 버튼이 낡을 수 있으나 최종 판단은 서버(too-late)가 한다.
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const [receiptOpen, setReceiptOpen] = useState(false);
  const print = usePrintForms();
  // 이 화면이 열릴 때 「영수증」 체크 여부를 다시 읽는다 (프린터설정에서 바꿨을 수 있다).
  const refreshReceiptEnabled = print?.refreshReceiptEnabled;
  useEffect(() => {
    void refreshReceiptEnabled?.();
  }, [refreshReceiptEnabled]);

  // 상세를 불러온다. 다시 불러올 때는 보이던 내용을 지우지 않는다 (loadKey만 올린다).
  useEffect(() => {
    let current = true;
    withTimeout(api.fetchDetail(orderId)).then(
      (next) => {
        if (!current) return;
        setDetail(next);
        setFailed(false);
      },
      (error: unknown) => {
        if (!current) return;
        setFailed(true);
        void logInfo(
          logMessages.historyRequestFailed(
            "detail",
            error instanceof RequestTimeoutError,
            errorSummary(error).name,
            orderId,
          ),
        );
      },
    );
    return () => {
      current = false;
    };
  }, [api, orderId, loadKey]);
  // 다시 시도하는 동안 실패 표시를 지워, 눌렸다는 것이 보이게 한다 (실패하면 다시 켜진다).
  const reload = useCallback(() => {
    setFailed(false);
    setLoadKey((k) => k + 1);
  }, []);

  const live = orders.find((o) => o.orderId === orderId);
  // [주문접수] 탭 · 다른 PC · 고객이 이 주문을 바꾸거나 목록에서 사라지면(취소) 상세도 다시 불러온다: 취소 시각 · 사유 같은 칸이 서버 값으로 채워진다.
  // 값은 렌더 중에 맞춘다(효과 안 setState 금지).
  const liveKey = live ? String(live.updatedAt) : "gone";
  const [seenRefresh, setSeenRefresh] = useState(refreshSeq);
  if (seenRefresh !== refreshSeq) {
    setSeenRefresh(refreshSeq);
    setLoadKey((k) => k + 1);
  }
  const [seenLiveKey, setSeenLiveKey] = useState(liveKey);
  if (seenLiveKey !== liveKey) {
    setSeenLiveKey(liveKey);
    setLoadKey((k) => k + 1);
  }
  const view: HistoryOrder | null =
    detail && live && live.updatedAt >= detail.updatedAt
      ? {
          ...detail,
          status: live.status,
          statusTimes: live.statusTimes,
          updatedAt: live.updatedAt,
        }
      : detail;

  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);

  const busy = !!inFlight[orderId];
  // 최신 상태를 다시 불러오지 못한 동안 보이는 내용은 낡았을 수 있어 상태 버튼을 막는다 (조용한 실패 방지).
  const blocked = busy || failed;
  const buttons = view
    ? summaryButtons(view.status, view.paidAt, openedAt)
    : null;
  const cancelled = !!view && isCancelledStatus(view.status);

  // [주문서 인쇄]는 접수대기에서 막히고 취소 주문에는 없다 (Q27). 주문서는 주문 목록의 Order 모양(옵션은 이름 글자)으로 낸다.
  const printing = !!print?.printing[orderId];
  async function printOrder() {
    if (!view || !print) return;
    const result = await print.printOrder({
      ...view,
      items: view.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        options: item.options.map((o) => o.name),
      })),
    });
    if (result === "no-printer") onToast(PRINT_TEXTS.noOrderPrinter);
  }

  async function next() {
    if (!view || !buttons?.next) return;
    let result: Awaited<ReturnType<typeof changeStatus>>;
    try {
      result = await changeStatus(orderId, buttons.next.action);
    } catch {
      // changeStatus는 던지지 않는 계약이지만 던지면 상태가 어긋났을 수 있으니 안내하고 다시 불러온다.
      reload();
      return onToast(
        BOARD_TEXTS.failureToast(view.pickupNumber, ORDER_MESSAGES.failed),
      );
    }
    if (result.ok) {
      reload();
      return onChanged();
    }
    // 문구 없는 거절(busy)만 조용히 넘긴다. not-allowed는 이 화면의 상태가 서버와 어긋난 것이라 안내하고 다시 불러온다.
    if (!result.ok && result.reason === "busy") return;
    const message =
      "message" in result ? result.message : ORDER_MESSAGES.failed;
    onToast(BOARD_TEXTS.failureToast(view.pickupNumber, message));
    reload(); // 다른 PC · 고객이 먼저 처리했다: 최신 상태를 다시 본다
    onChanged();
  }

  const header = (
    <header className="flex items-center gap-4 border-b border-gray-200 px-4 py-3">
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        className="min-h-14 rounded-xl border border-gray-300 px-5 text-xl"
      >
        {HISTORY_TEXTS.back}
      </button>
      {view && (
        <h2 className="text-2xl font-bold">
          #{view.pickupNumber}{" "}
          <span className={`ml-2 ${STATUS_VIEW[view.status].color}`}>
            {STATUS_VIEW[view.status].label}
          </span>
        </h2>
      )}
    </header>
  );

  if (!view) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-xl text-gray-600">
          {failed ? (
            <>
              <p>{HISTORY_TEXTS.detailFailed}</p>
              <button
                type="button"
                onClick={reload}
                className={`${GRAY} min-w-40`}
              >
                {HISTORY_TEXTS.retry}
              </button>
            </>
          ) : (
            <p>{HISTORY_TEXTS.loading}</p>
          )}
        </div>
      </div>
    );
  }

  const p = view.payment;
  const dl = "grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-lg";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {failed && (
        <div
          role="alert"
          className="flex items-center gap-4 bg-red-50 px-4 py-2 text-lg text-red-700"
        >
          <p className="flex-1">{HISTORY_TEXTS.staleFailed}</p>
          <button type="button" onClick={reload} className={GRAY}>
            {HISTORY_TEXTS.retry}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <Section title={HISTORY_TEXTS.menu}>
          <table className="w-full text-lg">
            <thead className="text-left text-base text-gray-500">
              <tr>
                {HISTORY_TEXTS.menuColumns.map((c, i) => (
                  <th
                    key={c}
                    className={`font-normal ${i > 0 ? "text-right" : ""}`}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.items.map((item, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 break-words">
                    {item.name}
                    {item.options.map((o, k) => (
                      <span
                        key={k}
                        className="block pl-4 text-base text-gray-600"
                      >
                        {o.name}
                        {o.price > 0 && ` (+${formatWon(o.price)})`}
                      </span>
                    ))}
                  </td>
                  <td className="py-1 text-right">
                    {formatWon(item.unitPrice)}
                  </td>
                  <td className="py-1 text-right">{item.quantity}</td>
                  <td className="py-1 text-right">
                    {formatWon(lineTotal(item))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 font-bold">
                <td colSpan={3} className="pt-1">
                  {HISTORY_TEXTS.total}
                </td>
                <td className="pt-1 text-right">{formatWon(p.orderAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Section title={HISTORY_TEXTS.basicInfo}>
            <dl className={dl}>
              <dt className="text-gray-500">{HISTORY_TEXTS.orderedAt}</dt>
              <dd>{formatDateTime(view.paidAt)}</dd>
              <dt className="text-gray-500">{HISTORY_TEXTS.orderNumber}</dt>
              <dd>{view.orderNumber}</dd>
              <dt className="text-gray-500">{HISTORY_TEXTS.customer}</dt>
              <dd>
                {view.customerName}{" "}
                <span className="rounded bg-gray-100 px-2 text-base">
                  {orderCountLabel(view.orderCount)}
                </span>
              </dd>
              <dt className="text-gray-500">{HISTORY_TEXTS.phone}</dt>
              <dd>{formatPhone(view.phoneLast4)}</dd>
              <dt className="text-gray-500">{HISTORY_TEXTS.pickupAt}</dt>
              {/* 지난 주문에 「N분 지남」을 붙이지 않도록 결제 시각 기준 문구만 쓴다. */}
              <dd>{pickupSchedule(view, view.paidAt).label}</dd>
            </dl>
          </Section>
          <Section title={HISTORY_TEXTS.payment}>
            <dl className={dl}>
              <dt className="text-gray-500">{HISTORY_TEXTS.orderAmount}</dt>
              <dd>{formatWon(p.orderAmount)}</dd>
              {p.discounts.map((d) => (
                <div key={d.kind} className="contents">
                  <dt className="text-gray-500">{DISCOUNT_LABELS[d.kind]}</dt>
                  <dd>-{formatWon(d.amount)}</dd>
                </div>
              ))}
              <dt className="font-bold text-gray-700">
                {HISTORY_TEXTS.paidAmount}
              </dt>
              <dd className="font-bold">{formatWon(p.paidAmount)}</dd>
              <dt className="text-gray-500">{HISTORY_TEXTS.method}</dt>
              <dd>{p.method}</dd>
              <dt className="text-gray-500">{HISTORY_TEXTS.paidAt}</dt>
              <dd>{formatDateTime(view.paidAt)}</dd>
              <dt className="text-gray-500">{HISTORY_TEXTS.transactionId}</dt>
              <dd className="break-all">{p.transactionId}</dd>
            </dl>
          </Section>
        </div>

        {view.note && (
          <section aria-label={HISTORY_TEXTS.note}>
            <h3 className="text-base font-bold text-gray-600">
              {HISTORY_TEXTS.note}
            </h3>
            <p className="mt-1 rounded bg-yellow-200 px-3 py-2 text-lg break-words whitespace-pre-wrap">
              {view.note}
            </p>
          </section>
        )}

        <Section title={HISTORY_TEXTS.history}>
          <ul className="text-lg">
            {historyEntries(view).map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-4">
                <span className="w-28 text-gray-500">{e.label}</span>
                <span>{formatDateTime(e.at)}</span>
                {e.note && <span className="break-words">{e.note}</span>}
                {e.menu && (
                  <span className="w-full pl-32 break-words text-gray-700">
                    {e.menu}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-gray-200 px-4 py-3">
        {/* 취소 주문은 취소 영수증만 있다 (Q27 · Q50). 영수증은 「영수증」 체크된 슬롯이 없으면 막힌다. */}
        <button
          type="button"
          disabled={!print?.receiptEnabled}
          onClick={() => setReceiptOpen(true)}
          className={GRAY}
        >
          {HISTORY_TEXTS.printReceipt}
        </button>
        {!cancelled && (
          <button
            type="button"
            disabled={!print || view.status === "pending" || printing}
            onClick={printOrder}
            className={GRAY}
          >
            {printing ? PRINT_TEXTS.printing : HISTORY_TEXTS.printOrder}
          </button>
        )}
        <span className="flex-1" />
        {buttons && buttons.cancel !== "hidden" && (
          <button
            type="button"
            disabled={buttons.cancel === "disabled" || blocked}
            onClick={() => setCancelOpen(true)}
            className={GRAY}
          >
            {HISTORY_TEXTS.cancel}
          </button>
        )}
        {buttons?.remake && (
          <button
            type="button"
            disabled={blocked}
            onClick={() => setRemakeOpen(true)}
            className={GRAY}
          >
            {HISTORY_TEXTS.remake}
          </button>
        )}
        {buttons?.next && (
          <button
            type="button"
            disabled={blocked}
            onClick={next}
            className={`${BUTTON} bg-blue-600 text-white`}
          >
            {busy ? HISTORY_TEXTS.busy : buttons.next.label}
          </button>
        )}
      </footer>
      {receiptOpen && (
        <ReceiptPreviewDialog
          orderId={orderId}
          api={api}
          onClose={() => setReceiptOpen(false)}
          onPrinted={() => {
            setReceiptOpen(false);
            onToast(PRINT_TEXTS.receiptPrinted);
          }}
        />
      )}
      {remakeOpen && view && buttons?.remake && (
        <RemakeDialog
          orderId={orderId}
          pickupNumber={view.pickupNumber}
          items={view.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            options: item.options.map((o) => o.name),
          }))}
          onClose={(result) => {
            setRemakeOpen(false);
            if (result === "back") return;
            // 성공이면 처리 이력에 재제조 줄이, 거절이면 서버의 최신 상태가 보이게 다시 불러온다.
            if (result === "rejected") setOpenedAt(Date.now());
            reload();
            onChanged();
          }}
          onToast={onToast}
        />
      )}
      {cancelOpen && buttons?.cancel === "enabled" && (
        <CancelReasonDialog
          orderId={orderId}
          onBack={() => setCancelOpen(false)}
          onCancelled={() => {
            setCancelOpen(false);
            reload();
            onChanged();
          }}
          onError={(_id, message) => {
            onToast(BOARD_TEXTS.failureToast(view.pickupNumber, message));
            reload(); // 고객이 먼저 취소했을 수 있다
            onChanged();
          }}
          onTooLate={() => {
            // 닫고 지금 시각으로 버튼을 다시 판단한다 (T18, 사용자 결정 A-1). 상태는 위 reload가 다시 받는다.
            setCancelOpen(false);
            setOpenedAt(Date.now());
          }}
        />
      )}
    </div>
  );
}
