// 로그인 후 탭과 콘텐츠 영역. 탭 안의 기능 화면은 T04 이후에 채운다 (스펙 1장 범위 밖).
import { useAppShell } from "./AppShellContext";
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
  const { state, actions } = useAppShell();
  const active =
    MAIN_TABS.find((t) => t.id === state.activeTab) ?? MAIN_TABS[0];
  const settings =
    SETTINGS_TABS.find((t) => t.id === state.settingsTab) ?? SETTINGS_TABS[0];

  return (
    <>
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
        {active.id === "settings" ? (
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
              <Placeholder label={settings.label} />
            </section>
          </>
        ) : (
          <Placeholder label={active.label} />
        )}
      </section>
    </>
  );
}
