// 계정 종류에 따른 권한 (스펙 2장 권한 표, Q10). 프린터설정은 두 계정 모두 바꾸므로 프린터 화면은 부르지 않는다.
// 지금 부르는 화면은 없고 T10 · T13이 쓴다.
import type { Session } from "../api/auth";

export type SettingKind = "widget" | "printer" | "aiPopular";

/** 그 환경설정을 바꿀 수 있는지. AI챗봇 인기메뉴만 웨일ERP 계정이 바꾼다. */
export function canEditSetting(session: Session, kind: SettingKind): boolean {
  return kind !== "aiPopular" || session.accountType === "master";
}
