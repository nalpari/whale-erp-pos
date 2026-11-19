// 인기메뉴 API를 화면에 내려 주는 Context. Provider가 없으면(일부 테스트) 그 탭만 자리표시로 둔다.
import { createContext, useContext } from "react";
import type { PopularApi } from "./popular";

export const PopularApiContext = createContext<PopularApi | null>(null);

export function usePopularApi(): PopularApi | null {
  return useContext(PopularApiContext);
}
