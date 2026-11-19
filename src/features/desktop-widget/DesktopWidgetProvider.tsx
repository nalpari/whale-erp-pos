// 본 창 쪽 위젯 연결 (T06 스펙 3.2 · 3.4 · 4장). 주문 목록은 이 창 하나가 가지고, 위젯 창에는 그릴 화면만 보낸다.
// - 새 주문 · 30초 반복: 알림음을 내고, 본 창이 앞이 아니면 위젯을 띄운다.
// - 위젯에서 온 동작을 changeStatus · 요약 팝업 · 취소 팝업으로 잇는다.
// 로그인한 동안에만 동작하고, 로그아웃하면 위젯을 숨긴다. 본 창이 없어지면 위젯 창은 Rust(lib.rs)가 닫는다.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppShell } from "../app-shell/AppShellContext";
import { BOARD_TEXTS } from "../order-board/board-texts";
import { CancelReasonDialog } from "../order-summary/CancelReasonDialog";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { ORDER_MESSAGES } from "../../shared/orders/order-texts";
import { useOrders } from "../../shared/orders/orders-context";
import { UNDO_WINDOW_MS } from "../../shared/orders/orders-state";
import { ALERT_REPEAT_MS } from "../../shared/sound/sound-player";
import { Toast } from "../../shared/ui/Toast";
import { useWidgetSettings } from "../settings-widget/widget-settings-context";
import { widgetStatuses } from "../settings-widget/widget-settings";
import { startWithRetry } from "./retry";
import {
  OpenRequestContext,
  type OpenRequest,
  type OpenRequestValue,
} from "./open-request";
import {
  buildWidgetView,
  hasPendingOrder,
  WIDGET_FAILURE_MS,
} from "./widget-logic";
import type { WidgetHost } from "./widget-host";
import { HIDDEN_VIEW, type WidgetCommand } from "./widget-protocol";

interface Props {
  host: WidgetHost;
  children: ReactNode;
}

export function DesktopWidgetProvider({ host, children }: Props) {
  const { state: shell, actions } = useAppShell();
  const { orders, sound, inFlight, changeStatus, onNewOrder } = useOrders();
  const active = shell.session !== null;
  // 환경설정의 위젯설정: 보일 상태 · 위치. 바꾸면 바로 다음 화면부터 반영된다 (T10).
  const { settings } = useWidgetSettings();
  const statuses = useMemo(() => widgetStatuses(settings), [settings]);
  const position = settings.position;

  // 위젯을 띄운 상태 (본 창이 앞이 아닐 때 새 주문 · 30초 반복 · 서버 자동 OFF가 켠다). 머리 [×] · 카드 0장이면 꺼진다.
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  // 새 주문이 올 때마다 올라가는 번호. 30초 반복을 그때부터 다시 세어, 반복 직전에 온 새 주문이 1초 뒤 또 울리지 않게 한다.
  const [newOrderTick, setNewOrderTick] = useState(0);
  // 「완료 취소」 카드가 떠 있는 주문 → 마감 시각.
  const [lingering, setLingering] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [autoOffDismissed, setAutoOffDismissed] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; message: string } | null>(
    null,
  );
  const requestSeq = useRef(0);
  // 위젯의 동작 받기 등록이 계속 실패했다 (A-2).
  const [linkFailed, setLinkFailed] = useState(false);
  const [request, setRequest] = useState<OpenRequest | null>(null);

  // 서버가 주문받기를 다시 켜면 자동 OFF 안내가 사라진다. 다음 자동 OFF에는 다시 뜰 수 있게 닫음 표시도 지운다.
  if (!shell.autoOffBanner && autoOffDismissed) setAutoOffDismissed(false);
  const autoOffCard = active && shell.autoOffBanner && !autoOffDismissed;
  // 없어진 주문의 닫음 기록은 지운다. 며칠 켜 두는 동안 쌓이지 않게 한다 (설계 원칙 5).
  if (
    dismissed.size > 0 &&
    [...dismissed].some((id) => !orders.some((o) => o.orderId === id))
  ) {
    setDismissed(
      new Set(
        [...dismissed].filter((id) => orders.some((o) => o.orderId === id)),
      ),
    );
  }

  // 이벤트 · 타이머 안에서 렌더 값을 읽기 위한 사본.
  const latest = useRef({ orders, changeStatus, host, sound });
  useEffect(() => {
    latest.current = { orders, changeStatus, host, sound };
  });
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      fn();
    }, ms);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  /** 본 창이 앞이 아니면 위젯을 띄운다. restorePending이면 닫아 둔 접수대기 카드도 다시 띄운다 (3.2). */
  const reveal = useCallback(async (restorePending: boolean) => {
    let front: boolean;
    try {
      front = await latest.current.host.isMainFront();
    } catch {
      // 앞인지 모르면 놓치지 않는 쪽(띄움)으로 본다. 계속 실패하면(권한 누락 등) 이유를 알 수 있게 남긴다.
      void logInfo(logMessages.widgetFailed("present"));
      front = false;
    }
    if (front) return;
    setShown(true);
    if (restorePending) {
      setDismissed((prev) => {
        const next = new Set(prev);
        for (const o of latest.current.orders) {
          if (o.status === "pending") next.delete(o.orderId);
        }
        return next;
      });
    }
  }, []);

  // 새 주문: 같은 순간 여러 건이 와도 소리는 한 번 (2장). 신호가 한 번에 연달아 오므로 마이크로태스크로 모은다.
  useEffect(() => {
    if (!active) return;
    let scheduled = false;
    const off = onNewOrder(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        latest.current.sound.playNewOrder();
        setNewOrderTick((n) => n + 1);
        void reveal(false);
      });
    });
    return off;
  }, [active, onNewOrder, reveal]);

  // 접수대기가 하나라도 있으면 30초마다 소리 + (본 창이 앞이 아니면) 위젯 다시 띄움. 모두 처리하면 멈춘다 (2장).
  const hasPending = hasPendingOrder(orders);
  useEffect(() => {
    if (!active || !hasPending) return;
    const timer = setInterval(() => {
      latest.current.sound.playNewOrder();
      void reveal(true);
    }, ALERT_REPEAT_MS);
    return () => clearInterval(timer);
  }, [active, hasPending, newOrderTick, reveal]);

  // 로그아웃하면 연결 실패 표시도 지운다. 다시 로그인해 첫 시도에 성공하면 복구 신호가 없어 표시가 남기 때문이다.
  if (!active && linkFailed) setLinkFailed(false);

  // 서버 자동 OFF: 알림음은 T03이 이미 낸다. 위젯은 새 주문과 같은 조건으로 띄운다 (Q54).
  const autoOffBanner = active && shell.autoOffBanner;
  useEffect(() => {
    if (autoOffBanner) void reveal(false);
  }, [autoOffBanner, reveal]);

  const full = useMemo(
    () =>
      buildWidgetView(orders, {
        shown: true,
        dismissed,
        lingering,
        autoOffCard,
        inFlight,
        failures,
        statuses,
      }),
    [orders, dismissed, lingering, autoOffCard, inFlight, failures, statuses],
  );
  // 로그아웃하면 위젯이 닫힌다 (3.1). 카드가 0장이 되면 "띄운 상태"도 끈다 (3.2): 안 그러면 나중에 카드가 생길 때
  // 본 창이 앞인데도 위젯이 떠 버린다. 렌더 중에 고쳐 두면 효과를 거치지 않고 바로 반영된다.
  if (shown && (!active || !full.visible)) setShown(false);
  if (!active && cancelId) setCancelId(null);
  const view = useMemo(
    () => (active && shown ? { ...full, linkFailed, position } : HIDDEN_VIEW),
    [active, shown, full, linkFailed, position],
  );

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
    host
      .publish(view)
      .catch(() => void logInfo(logMessages.widgetFailed("publish")));
  }, [host, view]);

  const showToast = useCallback((message: string) => {
    setToast((t) => ({ key: (t?.key ?? 0) + 1, message }));
  }, []);

  const failCard = useCallback(
    (orderId: string, message: string) => {
      const order = latest.current.orders.find((o) => o.orderId === orderId);
      const text = order
        ? BOARD_TEXTS.failureToast(order.pickupNumber, message)
        : message;
      setFailures((f) => ({ ...f, [orderId]: text }));
      later(
        () =>
          setFailures((f) => {
            if (f[orderId] !== text) return f; // 그 사이 새 실패로 바뀌었으면 그쪽이 3초를 채운다.
            const next = { ...f };
            delete next[orderId];
            return next;
          }),
        WIDGET_FAILURE_MS,
      );
    },
    [later],
  );

  const setUndoCard = useCallback(
    (orderId: string) => {
      const expiresAt = Date.now() + UNDO_WINDOW_MS;
      setLingering((m) => new Map(m).set(orderId, expiresAt));
      later(
        () =>
          setLingering((m) => {
            if (m.get(orderId) !== expiresAt) return m;
            const next = new Map(m);
            next.delete(orderId);
            return next;
          }),
        UNDO_WINDOW_MS,
      );
    },
    [later],
  );
  const clearUndoCard = useCallback((orderId: string) => {
    setLingering((m) => {
      if (!m.has(orderId)) return m;
      const next = new Map(m);
      next.delete(orderId);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (
      orderId: string,
      action: "accept" | "complete" | "pickup" | "undo-pickup",
    ) => {
      // [픽업완료]는 요청 전에 카드 자리를 잡아 둔다. 성공해 상태가 바뀌는 순간 카드가 0장이 돼 위젯이 깜빡 사라지는 것을 막는다.
      if (action === "pickup") setUndoCard(orderId);
      let result: Awaited<ReturnType<typeof changeStatus>>;
      try {
        result = await latest.current.changeStatus(orderId, action);
      } catch {
        if (action === "pickup") clearUndoCard(orderId);
        failCard(orderId, ORDER_MESSAGES.failed);
        return;
      }
      if (result.ok) {
        if (action === "pickup") setUndoCard(orderId); // 5초는 성공한 때부터 센다.
        if (action === "undo-pickup") clearUndoCard(orderId);
        return;
      }
      if (action === "pickup") clearUndoCard(orderId);
      // 문구 없는 거절은 [완료 취소]일 때만 알린다 (T04 run과 같은 이유: 5초 끝에 눌러 서버에 안 간 경우).
      const message =
        "message" in result
          ? result.message
          : action === "undo-pickup"
            ? ORDER_MESSAGES.failed
            : null;
      if (message) failCard(orderId, message);
    },
    [failCard, setUndoCard, clearUndoCard],
  );

  const bringMain = useCallback(async () => {
    try {
      await latest.current.host.bringMainToFront();
    } catch {
      void logInfo(logMessages.widgetFailed("bring-front"));
    }
  }, []);

  const handleCommand = useCallback(
    (command: WidgetCommand) => {
      switch (command.type) {
        case "ready":
          host
            .publish(viewRef.current)
            .catch(() => void logInfo(logMessages.widgetFailed("publish")));
          return;
        case "action":
          void runAction(command.orderId, command.action);
          return;
        case "cancel": {
          void bringMain();
          const order = latest.current.orders.find(
            (o) => o.orderId === command.orderId,
          );
          if (order?.status === "pending" || order?.status === "preparing") {
            setCancelId(command.orderId);
          } else {
            // 그 사이 다른 PC · 고객이 처리했거나 목록에서 사라졌다. 번호를 못 찾으면 원문만 보인다 (사용자 결정 B-2).
            showToast(
              order
                ? BOARD_TEXTS.failureToast(
                    order.pickupNumber,
                    ORDER_MESSAGES.alreadyHandled,
                  )
                : ORDER_MESSAGES.alreadyHandled,
            );
          }
          return;
        }
        case "open":
        case "more":
          actions.selectTab("order-board");
          // 번호는 늘어나기만 해야 한다. 처리된 요청이 null로 지워진 뒤에도 이전 번호와 같아지면 화면이 새 요청으로 보지 않는다.
          setRequest(() => ({
            seq: ++requestSeq.current,
            orderId: command.type === "open" ? command.orderId : undefined,
          }));
          void bringMain();
          return;
        case "close-card":
          setDismissed((prev) => new Set(prev).add(command.orderId));
          return;
        case "close-all":
          setShown(false);
          return;
        case "auto-off-open":
          void bringMain();
          return;
        case "auto-off-close":
          setAutoOffDismissed(true);
          return;
      }
    },
    [host, runAction, bringMain, actions, showToast],
  );
  const commandRef = useRef(handleCommand);
  useEffect(() => {
    commandRef.current = handleCommand;
  });
  // 위젯의 ready는 로그인한 동안에만 받는다. 로그아웃 중에는 위젯이 숨어 있고, 화면이 바뀔 때마다 다시 보내므로 놓치는 것이 없다.
  // 받기 등록이 실패하면 다시 시도하고, 계속 실패하면 위젯 카드에 「본 화면에서 처리해 주세요」를 보인다 (A-2).
  useEffect(() => {
    if (!active) return;
    return startWithRetry(() => host.onCommand((c) => commandRef.current(c)), {
      onGiveUp: () => {
        void logInfo(logMessages.widgetFailed("listen"));
        setLinkFailed(true);
      },
      onRecovered: () => setLinkFailed(false),
    });
  }, [host, active]);

  const consume = useCallback(
    (seq: number) => setRequest((r) => (r?.seq === seq ? null : r)),
    [],
  );
  const requestValue = useMemo<OpenRequestValue>(
    () => ({ request, consume }),
    [request, consume],
  );

  // 취소 사유 팝업은 그 주문이 아직 취소할 수 있는 상태일 때만 둔다 (다른 PC가 처리했으면 닫힌다).
  const cancelOrder = cancelId
    ? orders.find((o) => o.orderId === cancelId)
    : undefined;
  const cancelOpen =
    active &&
    cancelOrder !== undefined &&
    (cancelOrder.status === "pending" || cancelOrder.status === "preparing");

  return (
    <OpenRequestContext.Provider value={requestValue}>
      {children}
      {cancelId && cancelOpen && (
        <CancelReasonDialog
          orderId={cancelId}
          onBack={() => setCancelId(null)}
          onCancelled={() => setCancelId(null)}
          onError={(id, message) => {
            const order = latest.current.orders.find((o) => o.orderId === id);
            showToast(
              order
                ? BOARD_TEXTS.failureToast(order.pickupNumber, message)
                : message,
            );
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
    </OpenRequestContext.Provider>
  );
}
