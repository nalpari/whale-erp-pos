import { panelId, tabId } from "./tab-ids";

// 탭 줄. 라우터 없이 화면 상태로 탭을 바꾼다 (스펙 2.1, 데스크톱이라 주소창이 없다).
interface TabBarProps<Id extends string> {
  label: string;
  tabs: readonly { id: Id; label: string }[];
  activeId: Id;
  idPrefix: string;
  size: "main" | "sub";
  onSelect(id: Id): void;
}

export function TabBar<Id extends string>({
  label,
  tabs,
  activeId,
  idPrefix,
  size,
  onSelect,
}: TabBarProps<Id>) {
  const sizeClass = size === "main" ? "h-14 px-8 text-xl" : "h-12 px-6 text-lg";
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex border-b border-gray-200 bg-gray-50"
    >
      {tabs.map((tab) => {
        const selected = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={tabId(idPrefix, tab.id)}
            aria-selected={selected}
            // 패널은 고른 탭 것만 그리므로, 없는 id를 가리키지 않게 고른 탭에만 붙인다.
            aria-controls={selected ? panelId(idPrefix, tab.id) : undefined}
            onClick={() => onSelect(tab.id)}
            className={`${sizeClass} border-b-4 ${
              selected
                ? "border-blue-600 font-bold text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
