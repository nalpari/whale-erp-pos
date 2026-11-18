// 계정 종류에 따른 권한. 화면은 이 값만 보고 환경설정 입력을 막는다 (스펙 2장 권한 표, Q10).
import type { Session } from "../api/auth";

export type SettingKind = "widget" | "printer" | "aiPopular";

/** 그 환경설정을 바꿀 수 있는지. AI챗봇 인기메뉴만 웨일ERP 계정이 바꾼다. */
export function canEditSetting(session: Session, kind: SettingKind): boolean {
  return kind !== "aiPopular" || session.accountType === "master";
}
