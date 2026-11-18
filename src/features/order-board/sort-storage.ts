// 첫 탭 정렬을 이 PC에 기억한다 (Q01 · Q15). 창 크기 저장과 같은 localStorage 방식이다.
// 저장소가 막혀 있어도 화면은 떠야 하므로 실패는 삼키고, 저장 실패만 로그에 남긴다 (스펙 4장).
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import type { SortOrder } from "./order-board-logic";

const KEY = "orderBoardSort";

export function loadSort(): SortOrder {
  try {
    return localStorage.getItem(KEY) === "oldest" ? "oldest" : "newest";
  } catch {
    return "newest";
  }
}

export function saveSort(sort: SortOrder): void {
  try {
    localStorage.setItem(KEY, sort);
  } catch {
    void logInfo(logMessages.settingsFailed("save"));
  }
}
