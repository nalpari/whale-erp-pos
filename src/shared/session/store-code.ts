export const STORE_CODE_MAX_LENGTH = 20;

/** 점포코드 입력 정리: 앞뒤 공백 제거, 소문자 → 대문자, 20자까지. 형식은 검사하지 않는다 (스펙 3.1-2). */
export function normalizeStoreCode(value: string): string {
  return value.trim().toUpperCase().slice(0, STORE_CODE_MAX_LENGTH);
}
