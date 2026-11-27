// 점포 주문설정 API를 화면에 내려 주는 Context. Provider가 없으면(일부 테스트) [주문설정] 탭만 자리표시로 둔다.
import { createContext, useContext } from "react";
import type { OrderSettingsApi } from "./order-settings";

export const OrderSettingsApiContext = createContext<OrderSettingsApi | null>(
  null,
);

export function useOrderSettingsApi(): OrderSettingsApi | null {
  return useContext(OrderSettingsApiContext);
}
