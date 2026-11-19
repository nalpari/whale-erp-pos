// 메뉴품절 API를 화면에 내려 주는 Context. Provider가 없으면(일부 테스트) [메뉴품절] 탭만 자리표시로 둔다.
import { createContext, useContext } from "react";
import type { SoldOutApi } from "./soldout";

export const SoldOutApiContext = createContext<SoldOutApi | null>(null);

export function useSoldOutApi(): SoldOutApi | null {
  return useContext(SoldOutApiContext);
}
