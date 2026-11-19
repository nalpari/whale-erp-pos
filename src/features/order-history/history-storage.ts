// 페이지당 건수를 이 PC에 기억한다 (Q37). 주문접수 정렬 저장(sort-storage)과 같은 방식이다.
// 저장소가 막혀 있어도 화면은 떠야 하므로 실패는 삼키고, 저장 실패만 로그에 남긴다.
import { PAGE_SIZES, type PageSize } from "../../shared/api/order-history";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";

const KEY = "orderHistoryPageSize";
export const DEFAULT_PAGE_SIZE: PageSize = 50;

export function loadPageSize(): PageSize {
  try {
    const value = Number(localStorage.getItem(KEY));
    return PAGE_SIZES.find((n) => n === value) ?? DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function savePageSize(size: PageSize): void {
  try {
    localStorage.setItem(KEY, String(size));
  } catch {
    void logInfo(logMessages.settingsFailed("save"));
  }
}
