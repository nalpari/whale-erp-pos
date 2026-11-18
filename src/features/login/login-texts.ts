// 화면 문구. 기획자 답변 · 화면정의서 원문 그대로 둔다 (스펙 3장). 테스트도 이 원문으로 확인한다.
export const INVALID_CREDENTIALS_MESSAGE =
  "! 아이디와 비밀번호가 올바르지 않습니다.";
export const NOT_SUBSCRIBED_MESSAGE =
  "픽업오더를 구독한 점포만 사용할 수 있습니다.";
export const STORE_NOT_MANAGED_MESSAGE =
  "이 계정으로 관리할 수 없는 점포입니다.";
export const PASSWORD_NOT_SET_MESSAGE =
  "웨일ERP 점포 상세에서 매장 프로그램 비밀번호를 먼저 설정해 주세요.";
export const LOCKED_MESSAGE =
  "로그인이 잠겼습니다. 5분 뒤에 다시 시도해 주세요.";
// 임시 문구 (스펙 3.4, 2026-11-16 결정). 서버 장애를 비밀번호 오류로 오해하지 않게 따로 둔다.
export const NETWORK_ERROR_MESSAGE =
  "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const STORE_TAB_HINT =
  "점포코드와 매장 프로그램 비밀번호는 웨일ERP 점포 상세에서 확인할 수 있습니다.";
export const ERP_TAB_HINT =
  "아이디 · 비밀번호를 잊으셨나요? 웨일ERP에서 찾을 수 있습니다.";
