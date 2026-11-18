// 고객이 접수대기 주문을 취소하면 어느 탭에 있든 알림음을 한 번 울린다 (사용자 결정 2026-11-18, 스펙 2.7 · 11장 E).
// 배너는 [주문접수] 탭에서만 보이지만 소리는 탭과 상관없어서, 항상 떠 있는 MainContent에서 그린다.
import { useEffect, useRef } from "react";
import type { Order } from "../../shared/api/orders";
import { useOrders } from "../../shared/orders/orders-context";
import { newlyCustomerCancelled, statusSnapshot } from "./order-board-logic";

export function CustomerCancelSound() {
  const { orders, sound } = useOrders();
  const previous = useRef<ReadonlyMap<string, Order["status"]> | null>(null);
  if (previous.current === null) previous.current = statusSnapshot(orders);
  useEffect(() => {
    newlyCustomerCancelled(previous.current ?? new Map(), orders).forEach(() =>
      sound.playNewOrder(),
    );
    previous.current = statusSnapshot(orders);
  }, [orders, sound]);
  return null;
}
