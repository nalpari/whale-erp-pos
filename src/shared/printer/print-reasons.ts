// 출력 실패 이유 (T12 스펙 5장). Rust(printer.rs)가 입력값 · 경로 없는 고정 문구로 돌려준다.
// 화면 띠와 로그에는 이 표에 있는 문구만 쓰고, 그 밖의 값(예상 밖 오류)은 「알 수 없는 오류」로 바꿔 개인정보가 섞이지 않게 한다.
const KNOWN_REASONS = [
  "프린터를 찾을 수 없음",
  "인쇄를 시작하지 못함",
  "인쇄를 마치지 못함",
  "글꼴을 만들지 못함",
  "이 PC에서는 출력할 수 없음",
  "출력 요청이 올바르지 않음",
] as const;

export const UNKNOWN_REASON = "알 수 없는 오류";

export function printFailReason(error: unknown): string {
  return typeof error === "string" &&
    (KNOWN_REASONS as readonly string[]).includes(error)
    ? error
    : UNKNOWN_REASON;
}
