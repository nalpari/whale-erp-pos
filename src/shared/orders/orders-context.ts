// 주문 목록 Context와 읽는 훅. Provider(OrdersProvider.tsx)와 파일을 나눠 두어야 화면 새로고침(fast refresh)이 된다.
import { createContext, useContext } from "react";
import type { Order, RemakeItem } from "../api/orders";
import type { SoundPlayer } from "../sound/sound-player";
import type {
  ChangeStatus,
  ConnectionState,
  RemakeOutcome,
  RemakeReason,
} from "./order-sync";

export interface OrdersContextValue {
  /** 결제 시각 순서의 주문 전체. */
  orders: Order[];
  /** 처리할 주문(접수대기 · 제조중 · 제조완료) 건수 (Q04). */
  pendingOrderCount: number;
  connection: ConnectionState;
  /** 알림음 · 경고음. 화면이 알림음을 직접 내야 할 때(예: 고객 취소 배너) 쓴다. */
  sound: SoundPlayer;
  /** 요청이 진행 중인 주문. 화면이 버튼을 막고 "요청 중"을 보이는 데 쓴다. */
  inFlight: Record<string, true>;
  /** 상태 변경 요청. 서버 성공 뒤에만 목록이 바뀐다. 실패하면 화면이 보일 문구를 돌려준다. */
  changeStatus: ChangeStatus;
  /** [재제조] 요청 (T21). 상태는 바꾸지 않는다. 같은 주문의 요청 중에는 busy. */
  remake(
    orderId: string,
    reason: RemakeReason,
    items: RemakeItem[],
  ): Promise<RemakeOutcome>;
  /** [새로고침]: 서버에서 전체를 다시 조회한다. 못 했으면 false (화면이 실패 문구를 보인다). */
  refresh(): Promise<boolean>;
  /** [픽업완료]를 누른 시각. 5초가 지나면 [완료 취소]를 받지 않는다. */
  pickedUpAt(orderId: string): number | undefined;
  /** "새 주문" 신호 (T06 알림음 · 위젯이 쓴다). 같은 주문은 한 번만 알린다. 해제 함수를 돌려준다. */
  onNewOrder(listener: (order: Order) => void): () => void;
  /** "이 PC에서 접수됨" 신호 (T12 주문서 출력이 쓴다). 서버 성공 뒤에만 낸다. */
  onAccepted(listener: (order: Order) => void): () => void;
}

export const OrdersContext = createContext<OrdersContextValue | null>(null);

export function useOrders(): OrdersContextValue {
  const value = useContext(OrdersContext);
  if (!value) {
    throw new Error("useOrders는 OrdersProvider 안에서만 쓸 수 있습니다.");
  }
  return value;
}

/** OrdersProvider 밖(주문 수신이 없는 화면 · 테스트)에서도 쓰는 읽기용 훅. 없으면 null. */
export function useOrdersOptional(): OrdersContextValue | null {
  return useContext(OrdersContext);
}
