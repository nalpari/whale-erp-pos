// 로그인 후 탭과 콘텐츠 영역. 탭 안의 기능 화면은 태스크마다 채우고, 아직 없는 탭은 Placeholder로 둔다.
import { useState } from "react";
import { useAppShell } from "./AppShellContext";
import { OrderHistoryScreen } from "../order-history/OrderHistoryScreen";
import { useOrderHistoryApi } from "../../shared/api/order-history-context";
import { CustomerCancelSound } from "../order-board/CustomerCancelSound";
import { OrderBoardScreen } from "../order-board/OrderBoardScreen";
import { WidgetSettingsScreen } from "../settings-widget/WidgetSettingsScreen";
import { PrinterSettingsScreen } from "../settings-printer/PrinterSettingsScreen";
import { useOrdersOptional } from "../../shared/orders/orders-context";
import { panelId, tabId } from "../../shared/ui/tab-ids";
import { TabBar } from "../../shared/ui/TabBar";
import { MAIN_TABS, SETTINGS_TABS } from "./tabs";

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center text-2xl text-gray-400">
      {label}
    </div>
  );
}

export function MainContent() {
  // 주문 수신(OrdersProvider)이 없는 곳(일부 테스트)에서는 주문접수 화면 대신 자리표시를 둔다.
  const hasOrders = useOrdersOptional() !== null;
  const historyApi = useOrderHistoryApi();
  const { state, actions, printerApi, printerSettingsStore } = useAppShell();
  const active =
    MAIN_TABS.find((t) => t.id === state.activeTab) ?? MAIN_TABS[0];
  // 주문내역은 한 번 열면 다른 탭에 가도 내리지 않고 숨겨 둔다: 보던 목록 · 상세가 그대로 남는다 (주문내역 SPEC 11장 C).
  // 값은 렌더 중에 맞춘다(효과 안 setState 금지). 로그아웃하면 이 화면이 통째로 내려가 처음 상태로 돌아간다.
  const [historyVisited, setHistoryVisited] = useState(false);
  const historyActive = active.id === "order-history";
  if (historyActive && !historyVisited) setHistoryVisited(true);
  const settings =
    SETTINGS_TABS.find((t) => t.id === state.settingsTab) ?? SETTINGS_TABS[0];

  return (
    <>
      {hasOrders && <CustomerCancelSound />}
      <TabBar
        label="메뉴"
        tabs={MAIN_TABS}
        activeId={state.activeTab}
        idPrefix="main"
        size="main"
        onSelect={actions.selectTab}
      />
      <section
        role="tabpanel"
        id={panelId("main", active.id)}
        aria-labelledby={tabId("main", active.id)}
        className="flex min-h-0 flex-1 flex-col"
      >
        {historyApi && hasOrders && historyVisited && (
          <div hidden={!historyActive} className="flex min-h-0 flex-1 flex-col">
            <OrderHistoryScreen api={historyApi} />
          </div>
        )}
        {historyActive && historyApi && hasOrders ? null : active.id ===
          "settings" ? (
          <>
            <TabBar
              label="환경설정 메뉴"
              tabs={SETTINGS_TABS}
              activeId={state.settingsTab}
              idPrefix="settings"
              size="sub"
              onSelect={actions.selectSettingsTab}
            />
            <section
              role="tabpanel"
              id={panelId("settings", settings.id)}
              aria-labelledby={tabId("settings", settings.id)}
              className="flex min-h-0 flex-1 flex-col"
            >
              {settings.id === "printer" && state.session ? (
                <PrinterSettingsScreen
                  printerApi={printerApi}
                  store={printerSettingsStore}
                  storeName={state.session.store.name}
                />
              ) : settings.id === "widget" ? (
                <WidgetSettingsScreen />
              ) : (
                <Placeholder label={settings.label} />
              )}
            </section>
          </>
        ) : active.id === "order-board" && hasOrders ? (
          <OrderBoardScreen />
        ) : (
          <Placeholder label={active.label} />
        )}
      </section>
    </>
  );
}
