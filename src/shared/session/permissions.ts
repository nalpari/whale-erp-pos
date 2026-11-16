// 계정 종류에 따른 권한. 화면은 이 값만 보고 환경설정 입력을 막는다 (스펙 2장).
import type { Session } from "../api/auth";

/** 환경설정을 바꿀 수 있는지. 점포번호 계정은 조회만 한다. */
export function canEditSettings(session: Session): boolean {
  return session.accountType === "master";
}
