// 영수증 미리보기 팝업 (T12 스펙 4.1). 주문 상세(결제정보)와 점포 정보를 서버에서 읽어 영수증 모양 그대로 보이고,
// [영수증 인쇄]로 「영수증」 체크된 슬롯 중 앞선 한 대에 낸다. 성공하면 부르는 쪽이 토스트를 보이고 팝업을 닫는다.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  HistoryOrder,
  OrderHistoryApi,
  ReceiptStore,
} from "../../shared/api/order-history";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { errorSummary } from "../../shared/error-summary";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { PaperPreview } from "./PaperPreview";
import { usePrintForms } from "./print-forms-context";
import { PRINT_TEXTS } from "./print-texts";
import { buildReceiptLines } from "./receipt-form";

interface Props {
  orderId: string;
  api: OrderHistoryApi;
  onClose(): void;
  /** 출력에 성공했다. 부르는 쪽이 「영수증을 출력했습니다.」 토스트를 보이고 팝업을 닫는다. */
  onPrinted(): void;
}

const BUTTON = "min-h-14 rounded-xl px-5 text-xl font-bold disabled:opacity-50";
const GRAY = `${BUTTON} border border-gray-300 bg-white text-gray-700 disabled:bg-gray-100 disabled:text-gray-400`;

type Loaded = { order: HistoryOrder; store: ReceiptStore };

export function ReceiptPreviewDialog({
  orderId,
  api,
  onClose,
  onPrinted,
}: Props) {
  const print = usePrintForms();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => closeRef.current?.focus(), []);

  useEffect(() => {
    let current = true;
    withTimeout(
      Promise.all([api.fetchDetail(orderId), api.fetchReceiptStore()]),
    ).then(
      ([order, store]) => {
        if (!current) return;
        setLoaded({ order, store });
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

  const retryLoad = useCallback(() => {
    setFailed(false);
    setLoadKey((k) => k + 1);
  }, []);

  async function send() {
    if (!print || !loaded || sending) return;
    setSending(true);
    setPrintError(null);
    try {
      const result = await print.printReceipt(loaded.order, loaded.store);
      if (result.ok) onPrinted();
      else setPrintError(result.message);
    } finally {
      setSending(false);
    }
  }

  // Esc는 이 팝업만 닫는다(아래 요약 팝업의 Esc 처리는 이 팝업이 열려 있는 동안 꺼진다).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-[28rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-white shadow-xl"
      >
        <header className="border-b border-gray-200 px-6 py-4">
          <h2 id={titleId} className="text-2xl font-bold">
            {PRINT_TEXTS.receiptPreviewTitle}
          </h2>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto bg-gray-100 px-6 py-4">
          {loaded ? (
            <PaperPreview
              lines={buildReceiptLines(loaded.order, loaded.store)}
              paperWidth={print?.receiptPaperWidth ?? 80}
            />
          ) : failed ? (
            <div role="alert" className="flex flex-col items-center gap-4 py-8">
              <p className="text-xl text-gray-700">
                {PRINT_TEXTS.receiptLoadFailed}
              </p>
              <button type="button" onClick={retryLoad} className={GRAY}>
                {PRINT_TEXTS.receiptRetry}
              </button>
            </div>
          ) : (
            <p className="py-8 text-xl text-gray-600">
              {PRINT_TEXTS.receiptLoading}
            </p>
          )}
        </div>
        {printError && (
          <p role="alert" className="px-6 pt-3 text-lg font-bold text-red-600">
            {printError}
          </p>
        )}
        <footer className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className={GRAY}
          >
            {PRINT_TEXTS.receiptClose}
          </button>
          <button
            type="button"
            disabled={!loaded || sending || !print?.receiptEnabled}
            onClick={send}
            className={`${BUTTON} bg-blue-600 text-white`}
          >
            {sending ? PRINT_TEXTS.printing : PRINT_TEXTS.receiptPrint}
          </button>
        </footer>
      </div>
    </div>
  );
}
