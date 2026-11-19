// 위젯설정 Context와 읽는 훅. Provider(WidgetSettingsContext.tsx)와 파일을 나눠 두어야 화면 새로고침(fast refresh)이 된다.
import { createContext, useContext } from "react";
import {
  DEFAULT_WIDGET_SETTINGS,
  type WidgetSettings,
} from "./widget-settings";

interface Value {
  settings: WidgetSettings;
  /** 바꾸고 바로 저장한다. 저장에 성공하면 true (화면이 「저장되었습니다」를 보인다). */
  update(patch: Partial<WidgetSettings>): boolean;
}

// Provider가 없는 곳(일부 테스트)은 기본값을 쓴다.
export const WidgetSettingsContext = createContext<Value>({
  settings: DEFAULT_WIDGET_SETTINGS,
  update: () => false,
});

export function useWidgetSettings(): Value {
  return useContext(WidgetSettingsContext);
}
