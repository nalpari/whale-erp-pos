// 주문 수신 · 재연결 · 상태 변경 요청을 한 곳에서 돌린다 (SPEC-order-sync 3장). React를 모른다.
// OrdersProvider가 로그인 때 만들고 로그아웃 때 멈춘다.
import type { OrderFeed, OrderEvent } from "../api/order-feed";
import type { Order, OrderAction, OrderApi } from "../api/orders";
import type { StoreStatusApi } from "../api/store-status";
import { RequestTimeoutError, withTimeout } from "../api/with-timeout";
import { logInfo } from "../log/log";
import {
  logMessages,
  type OrderLogResult,
  type SyncRequestKind,
} from "../log/log-messages";
import type { SoundPlayer } from "../sound/sound-player";
import { ORDER_MESSAGES } from "./order-texts";
import {
  canApplyAction,
  canUndoPickup,
  rememberEventId,
  type OrdersAction,
  type OrdersState,
} from "./orders-state";

export const HEARTBEAT_MS = 15_000;
export const POLL_MS = 30_000;
/** 연결 신호와 조회가 각각 연달아 이만큼 실패하면 끊긴 것으로 본다 (11장 H). */
export const FAILURES_TO_DISCONNECT = 2;
export const RECONNECT_FIRST_MS = 1000;
export const RECONNECT_MAX_MS = 30_000;

export type ConnectionState = "connected" | "reconnecting";

export type StatusOutcome =
  | { ok: true }
  /** 화면에 보일 문구가 없는 거절. 요청은 서버로 가지 않았다. */
  | { ok: false; reason: "not-allowed" | "busy" }
  /** 화면(T04 · T05)이 message를 토스트로 보인다. */
  | {
      ok: false;
      reason: "already-handled" | "customer-cancelled" | "failed";
      message: string;
    };

export interface OrderSyncDeps {
  orderApi: OrderApi;
  orderFeed: OrderFeed;
  storeStatusApi: StoreStatusApi;
  sound: SoundPlayer;
  getState(): OrdersState;
  /** 액션을 반영하고 반영된 새 상태를 돌려준다. */
  commit(action: OrdersAction): OrdersState;
  setConnection(connection: ConnectionState): void;
  /** 서버가 바꾼 주문받기를 헤더에 반영한다 (확인창 없음, 스펙 3.5-1). */
  applyServerAccepting(accepting: boolean, autoOff: boolean): void;
  onNewOrder(order: Order): void;
  onAccepted(order: Order): void;
}

export interface OrderSync {
  start(): Promise<void>;
  stop(): void;
  /** [새로고침]: 전체 다시 조회. 못 했으면 false (화면이 실패 문구를 보인다). */
  refresh(): Promise<boolean>;
  changeStatus: ChangeStatus;
}

/** [주문취소]는 사유가 있어야 보낸다 (Q17). 다른 동작에는 사유를 받지 않는다. */
export interface ChangeStatus {
  (
    orderId: string,
    action: Exclude<OrderAction, "cancel">,
  ): Promise<StatusOutcome>;
  (orderId: string, action: "cancel", reason: string): Promise<StatusOutcome>;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createOrderSync(deps: OrderSyncDeps): OrderSync {
  let disposed = false;
  let connection: ConnectionState = "connected";
  // 연결 신호와 조회는 따로 센다. 서로의 성공이 상대의 실패 횟수를 지우면, 두 타이머가 겹치는 순간(30초마다)
  // 어느 쪽이 먼저 끝나느냐에 따라 끊김 판단이 달라진다.
  const failures = { heartbeat: 0, fetch: 0 };
  let firstLoadDone = false;
  let acceptingReconciled = false;
  let stopFeed: (() => void) | null = null;
  let feedToken = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = RECONNECT_FIRST_MS;
  // 진행 중인 다시 연결 시도. 겹쳐 시작하지 않고, [새로고침]이 그 결과를 기다릴 수 있게 Promise를 둔다.
  let reconnectAttempt: Promise<void> | null = null;
  // 다시 연결 시도 도중 실시간 연결이 또 끊겼는지. 이미 "다시 연결 중"이라 goDisconnected가 무시하므로 따로 기억한다.
  let feedLostDuringAttempt = false;
  let disconnectedAt = 0;
  let eventIds: string[] = [];
  let duplicateEvents = 0;
  let loggedDropped = 0;
  const unacked = new Set<string>();
  let acking = false;
  // 실패 · 시간 초과로 끝난 요청의 멱등키. 점원이 다시 누르면 같은 키로 보내, 서버가 늦게 처리했더라도
  // 한 번만 처리되고 결과(ok)가 돌아와 "접수됨" 신호가 빠지지 않는다 (스펙 3.3-1). 확정 응답이 오면 지운다.
  const retryKeys = new Map<string, string>();
  // 시간 초과가 난 [접수]의 멱등키(orderId → key). 서버가 늦게 처리해 목록이 제조중으로 바뀌면 같은 키로 한 번 더
  // 물어, 성공이면 이 PC의 "접수됨" 신호를 낸다. 안 그러면 점원이 누른 PC인데도 주문서가 안 나온다.
  // 주문이 끝나면(취소 · 픽업완료 등) 지운다.
  const timedOutAccepts = new Map<string, string>();
  const confirming = new Set<string>();
  let requestCounter = 0;

  // 로그에는 요청 종류와 시간 초과 여부만 남긴다. 오류 본문은 남기지 않는다 (개인정보 규칙).
  function logFailure(kind: SyncRequestKind, error: unknown) {
    void logInfo(
      logMessages.syncRequestFailed(kind, error instanceof RequestTimeoutError),
    );
  }

  function afterCommit(next: OrdersState) {
    next.lastAdded.forEach((id) => unacked.add(id));
    for (const id of next.lastNew) {
      const order = next.orders[id];
      if (order) deps.onNewOrder(order);
    }
    if (next.lastAdded.length > 0) void flushAck();
    void confirmTimedOutAccepts();
  }

  async function confirmTimedOutAccepts() {
    for (const [orderId, key] of [...timedOutAccepts]) {
      // 앞선 확인을 기다리는 사이 멈췄거나 다른 쪽이 이미 처리해 기억이 지워졌으면 건너뛴다.
      if (disposed) return;
      if (timedOutAccepts.get(orderId) !== key) continue;
      const order = deps.getState().orders[orderId];
      const pressKey = `${orderId}:accept`;
      // 목록에서 사라졌거나 접수대기 · 제조중이 아니면 더 물을 이유가 없다 (취소 · 제조완료 · 픽업완료 · 0시 정리).
      if (
        !order ||
        (order.status !== "pending" && order.status !== "preparing")
      ) {
        timedOutAccepts.delete(orderId);
        retryKeys.delete(pressKey);
        continue;
      }
      // 아직 접수대기면 서버가 처리했는지 모른다. 점원이 다시 누르면 같은 키로 간다.
      if (
        order.status !== "preparing" ||
        confirming.has(orderId) ||
        deps.getState().inFlight[orderId]
      ) {
        continue;
      }
      confirming.add(orderId);
      // 확인하는 동안 같은 주문의 다른 버튼([제조완료] · [주문취소])이 눌려 결과가 엇갈리지 않게 "요청 중"으로 잡는다.
      deps.commit({ type: "request-started", orderId });
      try {
        const result = await withTimeout(
          deps.orderApi.changeStatus({
            orderId,
            action: "accept",
            idempotencyKey: key,
          }),
        );
        // 기다리는 사이 점원이 다시 눌러 이미 처리됐거나 멈췄으면 신호를 또 내지 않는다.
        if (disposed || timedOutAccepts.get(orderId) !== key) continue;
        timedOutAccepts.delete(orderId);
        retryKeys.delete(pressKey);
        deps.commit({
          type: "received",
          order: result.order,
          source: "response",
        });
        void logInfo(
          logMessages.orderStatusChanged(
            orderId,
            "accept",
            result.kind === "ok" ? "success" : result.kind,
          ),
        );
        // 같은 키라 서버는 처음 요청의 결과(ok)를 돌려준다. 다른 PC가 먼저 접수했다면 ok가 아니므로 신호를 내지 않는다 (Q13).
        if (result.kind === "ok") deps.onAccepted(result.order);
      } catch (error) {
        // 실패하면 기억을 남겨 다음 조회 때 다시 묻는다.
        if (!disposed) logFailure("confirm", error);
      } finally {
        confirming.delete(orderId);
        if (!disposed) deps.commit({ type: "request-finished", orderId });
      }
    }
  }

  async function flushAck() {
    if (acking || unacked.size === 0 || disposed) return;
    acking = true;
    const ids = [...unacked];
    try {
      await withTimeout(deps.orderApi.ackOrders(ids));
      ids.forEach((id) => unacked.delete(id));
    } catch (error) {
      // 실패하면 남겨 두었다가 다음 조회 때 다시 보낸다 (스펙 3.1-5). 끊김 판단에는 쓰지 않는다.
      logFailure("ack", error);
    } finally {
      acking = false;
    }
    // 보내는 동안 새로 들어온 주문은 바로 이어서 확인한다.
    if ([...unacked].some((id) => !ids.includes(id))) void flushAck();
  }

  function flushDropLog() {
    const total = deps.getState().droppedCount + duplicateEvents;
    if (total > loggedDropped) {
      void logInfo(logMessages.duplicatesDropped(total - loggedDropped));
      loggedDropped = total;
    }
  }

  function handleEvent(event: OrderEvent) {
    if (disposed) return;
    const remembered = rememberEventId(eventIds, event.eventId);
    eventIds = remembered.list;
    if (remembered.duplicate) {
      duplicateEvents += 1;
      return;
    }
    if (event.type === "orders-cleared") {
      // 개발용 모의 서버만 보내는 신호다. 운영에서 잘못 오면 주문이 소리 없이 사라지므로 무시하고 로그만 남긴다.
      if (!import.meta.env.DEV) {
        void logInfo(logMessages.ordersClearedIgnored());
        return;
      }
      afterCommit(deps.commit({ type: "reset" }));
      return;
    }
    if (event.type === "accepting-changed") {
      const autoOff = event.reason === "auto-cancel-streak";
      deps.applyServerAccepting(event.accepting, autoOff);
      if (autoOff) deps.sound.playNewOrder(); // 알림음 한 번 (Q54)
      return;
    }
    afterCommit(deps.commit({ type: "received", order: event.order }));
  }

  function closeFeed() {
    feedToken += 1;
    stopFeed?.();
    stopFeed = null;
  }

  async function openFeed() {
    closeFeed();
    const token = feedToken;
    const connecting = deps.orderFeed.connect({
      onEvent: (event) => {
        if (token === feedToken) handleEvent(event);
      },
      onClose: () => {
        if (token !== feedToken) return;
        if (connection === "reconnecting") feedLostDuringAttempt = true;
        else goDisconnected();
      },
    });
    let stop: () => void;
    try {
      stop = await withTimeout(connecting);
    } catch (error) {
      // 시간 초과 뒤 늦게 열린 연결이 남지 않게 닫는다.
      connecting.then((late) => late()).catch(() => {});
      throw error;
    }
    if (disposed || token !== feedToken) {
      stop();
      return;
    }
    stopFeed = stop;
  }

  async function load(silent: boolean) {
    const fromSeq = deps.getState().seq;
    const orders = await withTimeout(deps.orderApi.fetchOrders());
    if (disposed) return;
    afterCommit(
      deps.commit({
        type: "loaded",
        orders,
        silent,
        fromSeq,
        dayStart: startOfToday(),
      }),
    );
    firstLoadDone = true;
  }

  /**
   * 연결(처음 · 다시)이 된 직후 주문받기를 서버와 맞춘다.
   * 처음 맞추기에 성공하기 전까지는 켤 때 OFF로 시작하는 규칙(Q03)이 우선이라 서버가 ON이면 OFF를 보내고 (11장 J),
   * 그 뒤 다시 연결됐을 때는 서버가 되돌린 상태를 반영만 한다 (11장 I).
   * 연결 성공 여부와는 따로 다룬다. 이 요청만 실패해도 "인터넷 끊김"으로 보지 않는다.
   */
  async function syncAcceptingSafely() {
    try {
      await syncAccepting();
    } catch (error) {
      if (!disposed) logFailure("accepting", error);
    }
  }

  async function syncAccepting() {
    const serverAccepting = await withTimeout(
      deps.orderApi.getAcceptingOrders(),
    );
    if (disposed) return;
    if (!acceptingReconciled) {
      if (serverAccepting) {
        await withTimeout(deps.storeStatusApi.setAcceptingOrders(false));
        // 맞추는 사이 점원이 직접 켰다면 헤더도 서버처럼 OFF로 내려 둘이 어긋나지 않게 한다.
        if (!disposed) deps.applyServerAccepting(false, false);
      }
      acceptingReconciled = true;
    } else {
      deps.applyServerAccepting(serverAccepting, false);
    }
  }

  // attemptReconnect가 바꾼 값을 읽는다. 호출 전에 좁혀진 타입에 가려지지 않게 함수로 둔다.
  const isConnected = () => connection === "connected";

  function recordSuccess(channel: keyof typeof failures) {
    failures[channel] = 0;
  }
  function recordFailure(channel: keyof typeof failures, error: unknown) {
    logFailure(channel, error);
    failures[channel] += 1;
    if (failures[channel] >= FAILURES_TO_DISCONNECT) goDisconnected();
  }

  function goDisconnected() {
    if (disposed || connection === "reconnecting") return;
    connection = "reconnecting";
    disconnectedAt = Date.now();
    closeFeed();
    deps.setConnection("reconnecting");
    deps.sound.playWarning(); // 경고음 한 번 (Q51 ①)
    void logInfo(logMessages.connectionLost());
    reconnectDelay = RECONNECT_FIRST_MS;
    scheduleReconnect();
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => void attemptReconnect(), reconnectDelay);
  }

  function attemptReconnect(): Promise<void> {
    if (disposed) return Promise.resolve();
    reconnectAttempt ??= runReconnectAttempt().finally(() => {
      reconnectAttempt = null;
    });
    return reconnectAttempt;
  }

  async function runReconnectAttempt() {
    feedLostDuringAttempt = false;
    try {
      await openFeed();
      if (disposed) return;
      await load(!firstLoadDone);
      await syncAcceptingSafely();
      if (disposed) return;
      // 시도하는 사이 연결이 또 끊겼으면 죽은 연결을 "연결됨"으로 믿지 않는다. 다음 시도로 넘긴다.
      if (feedLostDuringAttempt) throw new Error("실시간 연결이 다시 끊김");
      connection = "connected";
      failures.heartbeat = 0;
      failures.fetch = 0;
      deps.setConnection("connected");
      void logInfo(
        logMessages.connectionRestored((Date.now() - disconnectedAt) / 1000),
      );
    } catch (error) {
      if (disposed) return;
      logFailure("connect", error);
      closeFeed();
      reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      scheduleReconnect();
    }
  }

  async function heartbeatTick() {
    if (connection !== "connected") return;
    try {
      await withTimeout(deps.orderApi.sendHeartbeat());
      if (!disposed) recordSuccess("heartbeat");
    } catch (error) {
      if (!disposed) recordFailure("heartbeat", error);
    }
  }

  async function pollTick() {
    if (connection !== "connected") return;
    // 처음 맞추기에 실패했다면 다시 시도한다.
    if (!acceptingReconciled) void syncAcceptingSafely();
    try {
      await load(false);
      if (disposed) return;
      recordSuccess("fetch");
      void flushAck();
      flushDropLog();
    } catch (error) {
      if (!disposed) recordFailure("fetch", error);
    }
  }

  async function start() {
    void logInfo(logMessages.ordersStarted());
    heartbeatTimer = setInterval(() => void heartbeatTick(), HEARTBEAT_MS);
    pollTimer = setInterval(() => void pollTick(), POLL_MS);
    try {
      await openFeed();
      if (disposed) return;
      await load(true);
      await syncAcceptingSafely();
    } catch (error) {
      if (disposed) return;
      // 처음부터 연결하지 못하면 바로 "다시 연결 중"으로 보고 다시 시도한다.
      logFailure("connect", error);
      goDisconnected();
    }
  }

  function stop() {
    if (disposed) return;
    disposed = true;
    timedOutAccepts.clear();
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
    clearTimeout(reconnectTimer);
    flushDropLog();
    closeFeed();
    void logInfo(logMessages.ordersStopped());
  }

  async function refresh(): Promise<boolean> {
    if (disposed) return false;
    if (connection === "reconnecting") {
      // 기다리지 않고 지금 다시 연결을 시도한다.
      clearTimeout(reconnectTimer);
      await attemptReconnect();
      return isConnected();
    }
    try {
      await load(false);
      if (disposed) return false;
      recordSuccess("fetch");
      void flushAck();
      return true;
    } catch (error) {
      if (!disposed) recordFailure("fetch", error);
      return false;
    }
  }

  async function changeStatus(
    orderId: string,
    action: OrderAction,
    reasonInput?: string,
  ): Promise<StatusOutcome> {
    const state = deps.getState();
    // [주문취소]는 사유가 없으면 보내지 않는다 (Q17). 타입으로도 막지만 JS 호출도 막는다.
    const reason = action === "cancel" ? reasonInput?.trim() : undefined;
    if (action === "cancel" && !reason) {
      return { ok: false, reason: "not-allowed" };
    }
    const order = state.orders[orderId];
    // 표에 없는 변경은 보내지 않는다 (스펙 2.1). [완료 취소]는 5초 안에만 받는다 (11장 F).
    if (
      !order ||
      !canApplyAction(order.status, action) ||
      (action === "undo-pickup" && !canUndoPickup(state, orderId, Date.now()))
    ) {
      return { ok: false, reason: "not-allowed" };
    }
    // 같은 주문의 요청이 진행 중이면 받지 않는다 (두 번 누름 방지, 스펙 3.3-3).
    if (state.inFlight[orderId]) {
      return { ok: false, reason: "busy" };
    }
    deps.commit({ type: "request-started", orderId });
    const pressKey = `${orderId}:${action}`;
    let idempotencyKey = retryKeys.get(pressKey);
    if (!idempotencyKey) {
      requestCounter += 1;
      idempotencyKey = `${pressKey}:${Date.now()}:${requestCounter}`;
      retryKeys.set(pressKey, idempotencyKey);
    }
    const log = (result: OrderLogResult) =>
      void logInfo(logMessages.orderStatusChanged(orderId, action, result));
    try {
      const result = await withTimeout(
        deps.orderApi.changeStatus({ orderId, action, reason, idempotencyKey }),
      );
      retryKeys.delete(pressKey); // 서버가 확정해서 답했다. 다음 누름은 새 요청이다.
      if (action === "accept") timedOutAccepts.delete(orderId);
      // 서버가 응답한 뒤에만 목록을 바꾼다 (낙관적 갱신 없음, 스펙 3.3-2). 결과 종류와 상관없이 서버가 준 최신 상태를 쓴다.
      if (!disposed) {
        afterCommit(
          deps.commit({
            type: "received",
            order: result.order,
            source: "response",
          }),
        );
      }
      if (result.kind === "ok") {
        log("success");
        if (!disposed) {
          if (action === "pickup") {
            deps.commit({ type: "pickup-confirmed", orderId, at: Date.now() });
          }
          if (action === "accept") deps.onAccepted(result.order);
        }
        return { ok: true };
      }
      if (result.kind === "already-handled") {
        log("already-handled");
        return {
          ok: false,
          reason: "already-handled",
          message: ORDER_MESSAGES.alreadyHandled,
        };
      }
      log("customer-cancelled");
      return {
        ok: false,
        reason: "customer-cancelled",
        message: ORDER_MESSAGES.customerCancelled,
      };
    } catch (error) {
      const timedOut = error instanceof RequestTimeoutError;
      if (timedOut && action === "accept") {
        timedOutAccepts.set(orderId, idempotencyKey);
      }
      log(timedOut ? "timeout" : "failed");
      return { ok: false, reason: "failed", message: ORDER_MESSAGES.failed };
    } finally {
      // 멈춘 뒤에는 건드리지 않는다. 바로 다시 로그인했다면 새 세션의 요청 중 표시를 지우게 된다.
      if (!disposed) {
        deps.commit({ type: "request-finished", orderId });
        // 시간 초과가 나는 사이 서버가 이미 처리해 목록이 제조중이 됐다면 지금 바로 결과를 확인한다.
        void confirmTimedOutAccepts();
      }
    }
  }

  return { start, stop, refresh, changeStatus: changeStatus as ChangeStatus };
}
