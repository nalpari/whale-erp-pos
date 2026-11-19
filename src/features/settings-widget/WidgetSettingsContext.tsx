// 위젯설정을 앱 전체에 내려 준다. 본 창(위젯에 보낼 화면 · 알림음)과 설정 화면이 같은 값을 본다 (T10 스펙 5장).
// 위젯 창은 이 값을 직접 읽지 않고, 본 창이 보내는 화면(WidgetView)에 담긴 위치를 따른다 (T06 구조).
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SoundPlayer } from "../../shared/sound/sound-player";
import { WidgetSettingsContext } from "./widget-settings-context";
import {
  loadWidgetSettings,
  saveWidgetSettings,
  type WidgetSettings,
} from "./widget-settings";

export function WidgetSettingsProvider({
  sound,
  children,
}: {
  sound: SoundPlayer;
  children: ReactNode;
}) {
  const [settings, setSettings] = useState(loadWidgetSettings);

  // 알림음 크기를 재생기에 알린다. 켤 때 저장된 값도 여기서 반영된다.
  useEffect(() => {
    sound.setVolume?.(settings.volume);
  }, [sound, settings.volume]);

  // 한 번의 이벤트에서 두 번 불려도 앞의 변경이 사라지지 않게 최신 값을 ref로 쥔다.
  const latest = useRef(settings);
  const update = useCallback((patch: Partial<WidgetSettings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettings(next);
    return saveWidgetSettings(next);
  }, []);
  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return (
    <WidgetSettingsContext.Provider value={value}>
      {children}
    </WidgetSettingsContext.Provider>
  );
}
