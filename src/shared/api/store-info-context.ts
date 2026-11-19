// 매장정보 API를 화면에 내려 주는 Context. Provider가 없으면(일부 테스트) [매장정보] 탭만 자리표시로 둔다.
import { createContext, useContext } from "react";
import type { StoreInfoApi } from "./store-info";

export const StoreInfoApiContext = createContext<StoreInfoApi | null>(null);

export function useStoreInfoApi(): StoreInfoApi | null {
  return useContext(StoreInfoApiContext);
}
