// 메뉴 구조는 화면정의서 p.4 메뉴구조도를 따른다.
export const MAIN_TABS = [
  { id: "order-board", label: "주문접수" },
  { id: "order-history", label: "주문내역" },
  { id: "store-info", label: "매장정보" },
  { id: "menu-sold-out", label: "메뉴품절" },
  { id: "settings", label: "환경설정" },
] as const;

// 숨긴 탭의 id도 타입에 남겨 인기메뉴 분기(MainContent)가 그대로 컴파일되게 한다.
export type SettingsTabId = "widget" | "printer" | "ai-popular-menu";

export const SETTINGS_TABS: readonly { id: SettingsTabId; label: string }[] = [
  { id: "widget", label: "위젯설정" },
  { id: "printer", label: "프린터설정" },
  // 1차 범위에서 숨김(고객 앱 AI 주문 제외, 2026-11-26). 다음 차수에 아래 줄 주석을 풀고 AiPopularTab.test의 skip을 뗀다.
  // { id: "ai-popular-menu", label: "AI챗봇 인기메뉴 설정" },
];

export type MainTabId = (typeof MAIN_TABS)[number]["id"];
