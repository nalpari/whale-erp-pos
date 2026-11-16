// 화면 문구. 화면정의서 v0.8 p.8~10 원문 그대로 둔다 (스펙 3장). 테스트도 이 원문으로 확인한다.
export const INVALID_CREDENTIALS_MESSAGE =
  "! 아이디와 비밀번호가 올바르지 않습니다.";
// 임시 문구 (스펙 10장, 11장 B). 서버 장애를 비밀번호 오류로 오해하지 않게 따로 둔다.
export const NETWORK_ERROR_MESSAGE =
  "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";
export const STORE_NOT_FOUND_LINES = [
  "파트너오피스에 일치하는 정보가 없습니다.",
  "대표자 이름과 이메일을 확인 후 다시 시도해 주세요.",
] as const;
