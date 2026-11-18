// 주문 목록을 본 창 화면에 두고 화면 전체에 내려 준다 (SPEC-order-sync 5장, 사용자 결정 A-1 · B-1).
// 로그인하면 수신을 시작하고 로그아웃하면 멈춘다. 실제 일은 order-sync.ts가 한다.
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAppShell } from "../../features/app-shell/AppShellContext";
import type { OrderFeed } from "../api/order-feed";
import type { Order, OrderApi } from "../api/orders";
import type { StoreStatusApi } from "../api/store-status";
import { logInfo } from "../log/log";
import { logMessages } from "../log/log-messages";
import type { SoundPlayer } from "../sound/sound-player";
import {
  createOrderSync,
  type ChangeStatus,
  type ConnectionState,
  type OrderSync,
  type StatusOutcome,
} from "./order-sync";
import { OrdersContext, type OrdersContextValue } from "./orders-context";
import {
  countPendingOrders,
  initialOrdersState,
  ordersReducer,
  type OrdersAction,
  type OrdersState,
} from "./orders-state";

interface Props {
  orderApi: OrderApi;
  orderFeed: OrderFeed;
  storeStatusApi: StoreStatusApi;
  sound: SoundPlayer;
  children: ReactNode;
}

/**
 * 신호를 받는 쪽(알림음 · 위젯 · 출력)이 예외를 던져도 수신 흐름이 끊기지 않게 하나씩 감싼다.
 * 로그에는 orderId만 남긴다.
 */
function notify(listeners: Set<(order: Order) => void>, order: Order) {
  for (const listener of listeners) {
    try {
      listener(order);
    } catch {
      void logInfo(logMessages.listenerFailed(order.orderId));
    }
  }
}

export function OrdersProvider({
  orderApi,
  orderFeed,
  storeStatusApi,
  sound,
  children,
}: Props) {
  const { state: shell, actions } = useAppShell();
  const active = shell.session !== null;

  const [state, dispatch] = useReducer(ordersReducer, initialOrdersState);
  // 수신 쪽(order-sync)이 렌더를 기다리지 않고 최신 목록을 읽고, 반영 직후 "새 주문"을 알 수 있게
  // 같은 reducer를 한 번 더 돌려 둔 사본이다. reducer가 순수 함수라 두 결과는 같다.
  const stateRef = useRef<OrdersState>(initialOrdersState);
  const commit = useCallback((action: OrdersAction) => {
    stateRef.current = ordersReducer(stateRef.current, action);
    dispatch(action);
    return stateRef.current;
  }, []);

  const [connection, setConnection] = useState<ConnectionState>("connected");
  const syncRef = useRef<OrderSync | null>(null);
  const newOrderListeners = useRef(new Set<(order: Order) => void>());
  const acceptedListeners = useRef(new Set<(order: Order) => void>());
  // 렌더마다 바뀌는 actions 때문에 수신이 다시 시작되지 않게 ref로 읽는다.
  const applyAcceptingRef = useRef(actions.applyServerAccepting);
  useEffect(() => {
    applyAcceptingRef.current = actions.applyServerAccepting;
  });

  useEffect(() => {
    if (!active) return;
    const sync = createOrderSync({
      orderApi,
      orderFeed,
      storeStatusApi,
      sound,
      getState: () => stateRef.current,
      commit,
      setConnection,
      applyServerAccepting: (accepting, autoOff) =>
        applyAcceptingRef.current(accepting, autoOff),
      onNewOrder: (order) => notify(newOrderListeners.current, order),
      onAccepted: (order) => notify(acceptedListeners.current, order),
    });
    syncRef.current = sync;
    void sync.start();
    return () => {
      sync.stop();
      syncRef.current = null;
      // 로그아웃하면 목록을 비운다. 다음 로그인은 다른 점포일 수 있다.
      commit({ type: "reset" });
      setConnection("connected");
    };
  }, [active, orderApi, orderFeed, storeStatusApi, sound, commit]);

  const orders = useMemo(
    () =>
      Object.values(state.orders).sort(
        (a, b) => a.paidAt - b.paidAt || a.orderId.localeCompare(b.orderId),
      ),
    [state.orders],
  );

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      pendingOrderCount: countPendingOrders(state),
      connection,
      inFlight: state.inFlight,
      changeStatus: ((orderId, action, reason) =>
        syncRef.current
          ? syncRef.current.changeStatus(
              orderId,
              action as "cancel",
              reason as string,
            )
          : Promise.resolve({
              ok: false,
              reason: "not-allowed",
            } satisfies StatusOutcome)) as ChangeStatus,
      refresh: () => syncRef.current?.refresh() ?? Promise.resolve(false),
      pickedUpAt: (orderId) => state.pickedUpAt[orderId],
      onNewOrder: (listener) => {
        newOrderListeners.current.add(listener);
        return () => newOrderListeners.current.delete(listener);
      },
      onAccepted: (listener) => {
        acceptedListeners.current.add(listener);
        return () => acceptedListeners.current.delete(listener);
      },
    }),
    [orders, state, connection],
  );

  return (
    <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
  );
}
