// 주문내역 API를 화면에 내려 주는 Context. OrdersProvider와 따로 둔 것은, 이 값이 없는 화면(일부 테스트)이 [주문내역] 탭만 자리표시로 두게 하려는 것이다.
import { createContext, useContext } from "react";
import type { OrderHistoryApi } from "./order-history";

export const OrderHistoryApiContext = createContext<OrderHistoryApi | null>(
  null,
);

export function useOrderHistoryApi(): OrderHistoryApi | null {
  return useContext(OrderHistoryApiContext);
}
