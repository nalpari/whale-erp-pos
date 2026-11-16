/**
 * 로그에 남길 오류 요약. 오류 객체를 통째로 남기면 HTTP 클라이언트가 담은 요청 본문
 * (휴대폰 번호 · 이메일)이 섞일 수 있어 이름과 문구만 남긴다 (스펙 8장).
 */
export function errorSummary(error: unknown): {
  name: string;
  message: string;
} {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "unknown", message: String(error) };
}
