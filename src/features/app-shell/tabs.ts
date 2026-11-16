// 메뉴 구조는 화면정의서 p.4 메뉴구조도를 따른다.
export const MAIN_TABS = [
  { id: "order-board", label: "주문접수" },
  { id: "order-history", label: "주문내역" },
  { id: "store-info", label: "매장정보" },
  { id: "menu-sold-out", label: "메뉴품절" },
  { id: "settings", label: "환경설정" },
] as const;

export const SETTINGS_TABS = [
  { id: "widget", label: "위젯설정" },
  { id: "printer", label: "프린터설정" },
  { id: "ai-popular-menu", label: "AI챗봇 인기메뉴 설정" },
] as const;

export type MainTabId = (typeof MAIN_TABS)[number]["id"];
export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/** 탭과 탭 패널을 aria-controls · aria-labelledby로 잇기 위한 id. */
export function tabId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`;
}

export function panelId(prefix: string, id: string) {
  return `${prefix}-panel-${id}`;
}
