import { normalizeStoreCode } from "./store-code";
// 마지막으로 로그인에 성공한 점포코드 (스펙 3.3). 비밀값이 아니라 localStorage에 둔다.
// 저장소가 막혀 있어도 로그인은 되어야 하므로 읽기 · 쓰기 실패는 삼킨다.
const KEY = "lastStoreCode";

export function loadLastStoreCode(): string {
  try {
    // 손상된 값이 들어 있어도 칸 규칙(대문자 · 20자)에 맞춘다.
    return normalizeStoreCode(localStorage.getItem(KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveLastStoreCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // 기억하지 못할 뿐이다. 다음에 점포코드를 다시 입력하면 된다.
  }
}
