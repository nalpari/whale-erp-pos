/** 숫자만 남긴다. 붙여 넣은 "010-1234-5678"도 숫자만 남는다 (스펙 3.1, 11장 D). */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}
