// 로그인 후 탭과 콘텐츠 영역. 탭 안의 기능 화면은 태스크마다 채우고, 아직 없는 탭은 Placeholder로 둔다.
import { useState } from "react";
import { useAppShell } from "./AppShellContext";
import { OrderHistoryScreen } from "../order-history/OrderHistoryScreen";
import { useOrderHistoryApi } from "../../shared/api/order-history-context";
import { useStoreInfoApi } from "../../shared/api/store-info-context";
import { useSoldOutApi } from "../../shared/api/soldout-context";
import { SoldOutScreen } from "../soldout/SoldOutScreen";
import { StoreInfoScreen } from "../store-info/StoreInfoScreen";
import { STORE_INFO_TEXTS } from "../store-info/store-info-texts";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { CustomerCancelSound } from "../order-board/CustomerCancelSound";
import { OrderBoardScreen } from "../order-board/OrderBoardScreen";
import { WidgetSettingsScreen } from "../settings-widget/WidgetSettingsScreen";
import { PrinterSettingsScreen } from "../settings-printer/PrinterSettingsScreen";
import { useOrdersOptional } from "../../shared/orders/orders-context";
import { panelId, tabId } from "../../shared/ui/tab-ids";
import { TabBar } from "../../shared/ui/TabBar";
import { MAIN_TABS, SETTINGS_TABS, type MainTabId } from "./tabs";

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
  const storeInfoApi = useStoreInfoApi();
  const soldoutApi = useSoldOutApi();
  // [메뉴품절] 탭을 누를 때마다(이미 그 탭일 때도) 목록을 다시 조회하게 알린다 (메뉴품절 SPEC 11장 A).
  const [soldoutPress, setSoldoutPress] = useState(0);
  // 품절 저장 · 삭제 · 추가 요청이 가는 중에는 메인 탭 이동을 막는다(결과 토스트가 사라지지 않게). 위젯 이동은 막지 않는다: 주문 처리가 먼저다.
  const [soldoutBusy, setSoldoutBusy] = useState(false);
  // 품절 목록 검색어. 화면은 탭을 벗어나면 내려가므로 여기서 들고 있어 갔다 와도 남긴다(로그아웃하면 이 컴포넌트째 내려가 지워진다).
  const [soldoutQuery, setSoldoutQuery] = useState("");
  // 매장정보에 저장하지 않은 변경이 있는데 다른 메인 탭을 누르면 확인창을 띄운다 (매장정보 SPEC 11장 A).
  // 화면은 이 탭일 때만 그려 내려가면 변경이 사라지므로, [나가기]는 탭만 옮기면 된다.
  const [storeInfoDirty, setStoreInfoDirty] = useState(false);
  // 저장 요청이 가는 중에는 탭 이동을 막는다(결과 토스트가 사라지지 않게). 위젯 이동은 막지 않는다: 주문 처리가 먼저다.
  const [storeInfoSaving, setStoreInfoSaving] = useState(false);
  const [leaveTo, setLeaveTo] = useState<MainTabId | null>(null);
  const { state, actions, printerApi, printerSettingsStore } = useAppShell();
  const active =
    MAIN_TABS.find((t) => t.id === state.activeTab) ?? MAIN_TABS[0];
  // 주문내역은 한 번 열면 다른 탭에 가도 내리지 않고 숨겨 둔다: 보던 목록 · 상세가 그대로 남는다 (주문내역 SPEC 11장 C).
  // 값은 렌더 중에 맞춘다(효과 안 setState 금지). 로그아웃하면 이 화면이 통째로 내려가 처음 상태로 돌아간다.
  const [historyVisited, setHistoryVisited] = useState(false);
  const historyActive = active.id === "order-history";
  // [주문내역] 탭을 누를 때마다(다른 탭에서 들어올 때, 이미 그 탭일 때도) 목록 · 상세를 다시 조회하게 알린다. at은 누른 시각이다.
  const [historyPress, setHistoryPress] = useState({ seq: 0, at: 0 });
  if (historyActive && !historyVisited) setHistoryVisited(true);
  const settings =
    SETTINGS_TABS.find((t) => t.id === state.settingsTab) ?? SETTINGS_TABS[0];

  // 탭 이동은 눌렀을 때와 확인창 [나가기]가 같은 길을 탄다: 주문내역은 어느 쪽으로 들어가도 다시 조회한다.
  function goTo(id: MainTabId) {
    actions.selectTab(id);
    if (id === "menu-sold-out") setSoldoutPress((n) => n + 1);
    if (id === "order-history") {
      setHistoryPress((p) => ({ seq: p.seq + 1, at: Date.now() }));
    }
  }
  // 확인창이 떠 있는 동안 다른 경로(위젯)로 매장정보를 벗어났으면 확인창도 거둔다. 렌더 중에 맞춘다(효과 안 setState 금지).
  if (leaveTo !== null && active.id !== "store-info") setLeaveTo(null);

  return (
    <>
      {/* 확인창이 떠 있는 동안 뒤 화면을 터치 · 초점으로 건드리지 못하게 막는다. */}
      <div inert={leaveTo !== null} className="flex min-h-0 flex-1 flex-col">
        {hasOrders && <CustomerCancelSound />}
        <TabBar
          label="메뉴"
          tabs={MAIN_TABS}
          activeId={state.activeTab}
          idPrefix="main"
          size="main"
          onSelect={(id) => {
            if (
              soldoutBusy &&
              active.id === "menu-sold-out" &&
              id !== active.id
            )
              return;
            if (
              storeInfoSaving &&
              active.id === "store-info" &&
              id !== active.id
            )
              return;
            if (
              storeInfoDirty &&
              active.id === "store-info" &&
              id !== active.id
            ) {
              setLeaveTo(id);
              return;
            }
            goTo(id);
          }}
        />
        <section
          role="tabpanel"
          id={panelId("main", active.id)}
          aria-labelledby={tabId("main", active.id)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {historyApi && hasOrders && historyVisited && (
            <div
              hidden={!historyActive}
              className="flex min-h-0 flex-1 flex-col"
            >
              <OrderHistoryScreen api={historyApi} refresh={historyPress} />
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
          ) : active.id === "store-info" && storeInfoApi ? (
            <StoreInfoScreen
              api={storeInfoApi}
              onDirtyChange={setStoreInfoDirty}
              onSavingChange={setStoreInfoSaving}
            />
          ) : active.id === "menu-sold-out" && soldoutApi ? (
            <SoldOutScreen
              api={soldoutApi}
              refreshSeq={soldoutPress}
              onBusyChange={setSoldoutBusy}
              query={soldoutQuery}
              onQueryChange={setSoldoutQuery}
            />
          ) : (
            <Placeholder label={active.label} />
          )}
        </section>
      </div>
      {leaveTo && (
        <ConfirmDialog
          title={STORE_INFO_TEXTS.leave.title}
          message={STORE_INFO_TEXTS.leave.message}
          confirmLabel={STORE_INFO_TEXTS.leave.confirm}
          cancelLabel={STORE_INFO_TEXTS.leave.cancel}
          onConfirm={() => {
            goTo(leaveTo);
            setLeaveTo(null);
          }}
          onCancel={() => setLeaveTo(null)}
        />
      )}
    </>
  );
}
