// 출력 연결 (T12 스펙 3 · 4 · 5장). 접수되면 주문서를 자동으로 내고, 수동 출력 · 영수증 · 실패 처리(경고음 · 띠 · 미출력)를 맡는다.
// 실패 기록(띠 · 미출력)은 메모리에만 둔다: 프로그램을 다시 켜면 사라진다 (11장 D).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  HistoryOrder,
  ReceiptStore,
} from "../../shared/api/order-history";
import type { RemakeItem } from "../../shared/api/orders";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { useOrders } from "../../shared/orders/orders-context";
import { printFailReason } from "../../shared/printer/print-reasons";
import type { PrintLine } from "../../shared/printer/print-lines";
import type {
  PaperWidth,
  PrinterSlot,
} from "../../shared/printer/printer-settings";
import { useAppShell } from "../app-shell/AppShellContext";
import { buildOrderLines, type OrderFormInput } from "./order-form";
import {
  PrintFormsContext,
  type FailedSlot,
  type OrderPrintResult,
  type PrintFailure,
  type PrintFormsValue,
  type ReceiptPrintResult,
} from "./print-forms-context";
import { PrintTimeoutError, withPrintTimeout } from "./print-timeout";
import { buildReceiptLines } from "./receipt-form";
import { PRINT_TEXTS } from "./print-texts";

const ORDER_DOC_NAME = "픽업오더 주문서";
const RECEIPT_DOC_NAME = "픽업오더 영수증";

/** 객체에서 키 하나를 뺀 새 객체. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

interface Target {
  index: number;
  slot: PrinterSlot;
}

export function PrintFormsProvider({ children }: { children: ReactNode }) {
  const { printerApi, printerSettingsStore, state } = useAppShell();
  const { onAccepted, sound, orders } = useOrders();
  const loggedIn = state.session !== null;

  const [failures, setFailures] = useState<Record<string, PrintFailure>>({});
  const [printing, setPrinting] = useState<Record<string, true>>({});
  const [receiptEnabled, setReceiptEnabled] = useState(false);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<PaperWidth>(80);

  // 비동기 처리 안에서 최신 값을 읽는다. 바꿀 때 바로 ref에도 써서 연달아 부르는 경우에도 어긋나지 않게 한다.
  const failuresRef = useRef(failures);
  const printingRef = useRef(printing);
  const commitFailures = useCallback(
    (
      update: (
        prev: Record<string, PrintFailure>,
      ) => Record<string, PrintFailure>,
    ) => {
      failuresRef.current = update(failuresRef.current);
      setFailures(failuresRef.current);
    },
    [],
  );

  // 로그아웃하면 기록을 지운다: 다음에 다른 점포로 로그인해도 이전 점포의 실패 띠가 남지 않게 한다.
  useEffect(() => {
    if (!loggedIn) commitFailures(() => ({}));
  }, [loggedIn, commitFailures]);

  // 「미출력」 주문이 취소되면(매장 · 고객 · 자동) 그 주문의 띠와 기록을 지운다: 취소된 주문서를 다시 내지 않게 한다 (사용자 결정 2026-11-19).
  useEffect(() => {
    const cancelledIds = Object.keys(failuresRef.current).filter((id) => {
      const status = orders?.find((o) => o.orderId === id)?.status;
      return status === "store-cancelled" || status === "customer-cancelled";
    });
    if (cancelledIds.length === 0) return;
    commitFailures((prev) => {
      const next = { ...prev };
      for (const id of cancelledIds) delete next[id];
      return next;
    });
  }, [orders, failures, commitFailures]);

  const latest = useRef({ printerApi, printerSettingsStore, sound, loggedIn });
  useEffect(() => {
    latest.current = { printerApi, printerSettingsStore, sound, loggedIn };
  });

  /** 설정을 읽는다. 읽지 못하면 null. */
  const loadSlots = useCallback(async (): Promise<Target[] | null> => {
    try {
      const settings = await latest.current.printerSettingsStore.load();
      return settings.slots.flatMap((slot, index) =>
        slot ? [{ index, slot }] : [],
      );
    } catch {
      return null;
    }
  }, []);

  const refreshReceiptEnabled = useCallback(async () => {
    const slots = await loadSlots();
    const target = slots?.find((t) => t.slot.printReceipt);
    setReceiptEnabled(!!target);
    setReceiptPaperWidth(target?.slot.paperWidth ?? 80);
  }, [loadSlots]);

  const setBusy = useCallback((orderId: string, busy: boolean) => {
    const next = { ...printingRef.current };
    if (busy) next[orderId] = true;
    else delete next[orderId];
    printingRef.current = next;
    setPrinting(next);
  }, []);

  /**
   * 주문서를 내고 결과를 처리한다. only가 있으면 그 슬롯에만 낸다(다시 인쇄).
   * 하나라도 실패하면 경고음 한 번 + 띠 + 미출력, 모두 성공하면 띠를 지운다.
   */
  const dispatch = useCallback(
    async (
      orderId: string,
      pickupNumber: number,
      lines: PrintLine[],
      only?: FailedSlot[],
      // 다시 인쇄에 쓸 줄. 「[재출력]」 머리가 붙은 수동 출력이 실패해도 다시 인쇄는 머리 없이 낸다 (스펙 3.2). 없으면 lines.
      retryLines: PrintLine[] = lines,
    ): Promise<OrderPrintResult> => {
      if (printingRef.current[orderId]) return "busy"; // 이미 보내는 중이다: 같은 주문을 겹쳐 내지 않는다
      setBusy(orderId, true);
      const fail = (
        slotsFailed: FailedSlot[],
        extraReason?: string,
      ): OrderPrintResult => {
        if (extraReason) void logInfo(logMessages.settingsFailed("load"));
        // 출력이 끝나기 전에 로그아웃했다면 알리지 않는다: 다음 로그인에 이전 점포의 띠가 남지 않게 한다.
        if (!latest.current.loggedIn) return "failed";
        latest.current.sound.playWarning();
        commitFailures((prev) => ({
          ...prev,
          [orderId]: {
            orderId,
            pickupNumber,
            lines: retryLines,
            slots: slotsFailed,
            ...(extraReason ? { extraReason } : {}),
          },
        }));
        return "failed";
      };
      try {
        const slots = await loadSlots();
        if (slots === null) {
          // 설정을 못 읽으면 어느 슬롯에 낼지 모른다. 이미 알던 실패 슬롯은 그대로 두고 이유만 덧붙인다
          // (덮어쓰면 성공한 슬롯에 다시 낸다). 처음 출력이면 슬롯이 비어, 다시 인쇄가 「주문서」 「주문서」 체크된 모든 슬롯에 낸다.
          return fail(only ?? [], PRINT_TEXTS.settingsFailed);
        }
        // 다시 인쇄는 실패한 슬롯에만. 실패한 슬롯을 모르면(처음부터 설정을 못 읽음) 체크된 모든 슬롯에 낸다.
        const onlySlots = only && only.length > 0 ? only : undefined;
        const targets = slots.filter((t) =>
          onlySlots
            ? onlySlots.some((f) => f.index === t.index)
            : t.slot.printOrder,
        );
        if (targets.length === 0) {
          // 낼 슬롯이 없다. 다시 인쇄 중이면 실패 기록을 지우지 않는다: 주문서는 아직 나오지 않았다.
          // 띠에 이유만 덧붙이고(경고음은 없음), 부르는 쪽이 토스트로 알린다.
          if (only && latest.current.loggedIn) {
            commitFailures((prev) =>
              prev[orderId]
                ? {
                    ...prev,
                    [orderId]: {
                      ...prev[orderId],
                      extraReason: PRINT_TEXTS.noPrinterNow,
                    },
                  }
                : prev,
            );
          }
          void logInfo(logMessages.printSkipped(orderId, !!only));
          return "no-printer";
        }
        const kind = only ? "retry" : "order";
        const failed = (
          await Promise.all(
            targets.map(async ({ index, slot }): Promise<FailedSlot | null> => {
              try {
                await withPrintTimeout(
                  latest.current.printerApi.printDocument(slot.printerName, {
                    docName: ORDER_DOC_NAME,
                    paperWidth: slot.paperWidth,
                    lines,
                  }),
                  (ok) =>
                    void logInfo(
                      logMessages.printLate(kind, orderId, index + 1, ok),
                    ),
                );
                void logInfo(
                  logMessages.printResult(kind, orderId, index + 1, {
                    ok: true,
                  }),
                );
                return null;
              } catch (error) {
                // 30초 안에 끝나지 않았다: 실패와 같게 알리되 문구는 「출력 결과를 확인할 수 없습니다.」 (Q47).
                const unknownResult = error instanceof PrintTimeoutError;
                const reason = unknownResult
                  ? PRINT_TEXTS.unknownResult
                  : printFailReason(error);
                void logInfo(
                  logMessages.printResult(kind, orderId, index + 1, {
                    ok: false,
                    reason,
                  }),
                );
                return {
                  index,
                  printerName: slot.printerName,
                  reason,
                  ...(unknownResult ? { unknownResult: true as const } : {}),
                };
              }
            }),
          )
        ).filter((f): f is FailedSlot => f !== null);
        if (failed.length === 0) {
          commitFailures((prev) => without(prev, orderId));
          return "ok";
        }
        return fail(failed);
      } finally {
        setBusy(orderId, false);
      }
    },
    [loadSlots, commitFailures, setBusy],
  );

  // 이 PC에서 접수가 서버에서 성공했을 때만 낸다. onAccepted는 한 번만 신호를 내므로 그것만 듣는다 (스펙 3.2).
  // 체크된 슬롯이 없으면 dispatch가 조용히 건너뛴다(T11 프린터설정 탭의 안내가 이미 있음).
  useEffect(() => {
    if (!loggedIn) return;
    return onAccepted((order) => {
      // 낼 슬롯이 없으면 dispatch가 로그만 남기고 건너뛴다(T11 프린터설정 탭의 안내가 이미 있음).
      void dispatch(order.orderId, order.pickupNumber, buildOrderLines(order));
    });
  }, [loggedIn, onAccepted, dispatch]);

  const retry = useCallback(
    async (orderId: string): Promise<OrderPrintResult> => {
      const failure = failuresRef.current[orderId];
      if (!failure) return "ok"; // 이미 성공해 지워졌다
      return dispatch(
        orderId,
        failure.pickupNumber,
        failure.lines,
        failure.slots,
      );
    },
    [dispatch],
  );

  const printOrder = useCallback(
    async (order: OrderFormInput & { orderId: string }) => {
      // 미출력 주문은 첫 출력과 같다: 실패한 슬롯에만, 「[재출력]」 없이 (스펙 3.2).
      const failure = failuresRef.current[order.orderId];
      if (failure) return retry(order.orderId);
      return dispatch(
        order.orderId,
        order.pickupNumber,
        buildOrderLines(order, { reprintAt: Date.now() }),
        undefined,
        buildOrderLines(order),
      );
    },
    [dispatch, retry],
  );

  // 기존 미출력 기록은 이 재제조 주문서 결과로 바뀐다: 성공하면 지우고, 실패하면 다시 인쇄도 재제조 주문서로 낸다(주방이 재제조인지 알아야 한다).
  // 같은 주문을 출력하는 중이면 버리지 않고 끝난 뒤에 낸다: 서버에는 재제조가 등록됐으므로 주문서가 빠지면 안 된다 (원칙 1).
  // 프린터별 출력은 30초 제한(print-timeout)이 있어 보통 오래 기다리지 않는다 (설정 읽기에는 제한이 없다).
  const printRemake = useCallback(
    async (
      order: OrderFormInput & { orderId: string },
      reason: string,
      items: RemakeItem[],
    ) => {
      while (printingRef.current[order.orderId]) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      // 기다리는 사이 로그아웃했다면 이전 점포의 주문서를 내지 않는다.
      if (!latest.current.loggedIn) return "failed";
      return dispatch(
        order.orderId,
        order.pickupNumber,
        buildOrderLines(order, { remake: { at: Date.now(), reason, items } }),
      );
    },
    [dispatch],
  );

  const dismiss = useCallback(
    (orderId: string) =>
      commitFailures((prev) =>
        prev[orderId]
          ? { ...prev, [orderId]: { ...prev[orderId], bannerClosed: true } }
          : prev,
      ),
    [commitFailures],
  );

  const printReceipt = useCallback(
    async (
      order: HistoryOrder,
      store: ReceiptStore,
    ): Promise<ReceiptPrintResult> => {
      const slots = await loadSlots();
      // 「영수증」 체크된 슬롯 중 번호가 가장 앞선 한 대 (Q45 ①).
      if (slots === null) {
        void logInfo(logMessages.settingsFailed("load"));
        return {
          ok: false,
          message: PRINT_TEXTS.receiptFailed(PRINT_TEXTS.settingsFailed),
        };
      }
      const target = slots.find((t) => t.slot.printReceipt);
      if (!target) return { ok: false, message: PRINT_TEXTS.noReceiptPrinter };
      try {
        await withPrintTimeout(
          latest.current.printerApi.printDocument(target.slot.printerName, {
            docName: RECEIPT_DOC_NAME,
            paperWidth: target.slot.paperWidth,
            lines: buildReceiptLines(order, store),
          }),
          (ok) =>
            void logInfo(
              logMessages.printLate(
                "receipt",
                order.orderId,
                target.index + 1,
                ok,
              ),
            ),
        );
        void logInfo(
          logMessages.printResult("receipt", order.orderId, target.index + 1, {
            ok: true,
          }),
        );
        return { ok: true };
      } catch (error) {
        const unknownResult = error instanceof PrintTimeoutError;
        const reason = unknownResult
          ? PRINT_TEXTS.unknownResult
          : printFailReason(error);
        void logInfo(
          logMessages.printResult("receipt", order.orderId, target.index + 1, {
            ok: false,
            reason,
          }),
        );
        if (unknownResult) {
          return {
            ok: false,
            message: PRINT_TEXTS.receiptUnknown(
              PRINT_TEXTS.slotOnly(target.index + 1, target.slot.printerName),
            ),
          };
        }
        return {
          ok: false,
          message: PRINT_TEXTS.receiptFailed(
            PRINT_TEXTS.failedSlot(
              target.index + 1,
              target.slot.printerName,
              reason,
            ),
          ),
        };
      }
    },
    [loadSlots],
  );

  const value = useMemo<PrintFormsValue>(
    () => ({
      failures: Object.values(failures).filter((f) => !f.bannerClosed),
      unprinted: new Set(Object.keys(failures)),
      printing,
      receiptEnabled,
      receiptPaperWidth,
      refreshReceiptEnabled,
      printOrder,
      printRemake,
      retry,
      dismiss,
      printReceipt,
    }),
    [
      failures,
      printing,
      receiptEnabled,
      receiptPaperWidth,
      refreshReceiptEnabled,
      printOrder,
      printRemake,
      retry,
      dismiss,
      printReceipt,
    ],
  );
  return (
    <PrintFormsContext.Provider value={value}>
      {children}
    </PrintFormsContext.Provider>
  );
}
