// 환경설정 > 위젯설정 화면 (화면정의서 p.18, T10 스펙 3장). 바꾸면 바로 이 PC에 저장하고 「저장되었습니다」를 보인다.
// 두 계정 모두 바꿀 수 있다 (Q10). 터치 우선이라 체크 · 라디오는 줄 전체(44px)를 눌러도 되고, 버튼 · 슬라이더 손잡이는 44px 이상이다.
import { useCallback, useState } from "react";
import { useOrdersOptional } from "../../shared/orders/orders-context";
import { Toast } from "../../shared/ui/Toast";
import { WIDGET_POSITIONS } from "../desktop-widget/widget-position";
import { useWidgetSettings } from "./widget-settings-context";
import { WidgetPreview } from "./WidgetPreview";
import { WIDGET_SETTINGS_TEXTS as T } from "./widget-settings-texts";
import {
  VOLUME_MAX,
  VOLUME_MIN,
  VOLUME_STEP,
  widgetStatuses,
  type WidgetSettings,
} from "./widget-settings";

const ROW =
  "flex min-h-11 items-center gap-3 rounded-lg px-2 text-xl select-none";
const CHECK = "h-7 w-7 shrink-0";
const SECTION = "flex flex-col gap-1 rounded-2xl bg-white p-4";
const PREVIEW_BUTTON =
  "min-h-11 rounded-lg bg-gray-800 px-4 text-lg font-bold text-white";
// 슬라이더: 손잡이를 44px로 키우고 줄은 가늘게 한다 (Chromium · WebKit 공통).
const SLIDER =
  "h-11 w-full cursor-pointer appearance-none bg-transparent " +
  "[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-gray-300 " +
  "[&::-webkit-slider-thumb]:-mt-[18px] [&::-webkit-slider-thumb]:h-11 [&::-webkit-slider-thumb]:w-11 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600";

export function WidgetSettingsScreen() {
  const { settings, update } = useWidgetSettings();
  const sound = useOrdersOptional()?.sound;
  const [saveFailed, setSaveFailed] = useState(false);
  // 저장 성공 토스트. 번호가 바뀌면 새로 그려 2초를 다시 잰다 (프린터설정과 같음).
  const [toastNo, setToastNo] = useState(0);
  const closeToast = useCallback(() => setToastNo(0), []);

  function change(patch: Partial<WidgetSettings>) {
    const ok = update(patch);
    setSaveFailed(!ok);
    setToastNo((n) => (ok ? n + 1 : 0));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-gray-50 p-4">
      <h2 className="text-2xl font-bold">{T.title}</h2>
      {saveFailed && (
        <p role="alert" className="text-xl text-red-600">
          {T.saveFailed}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <fieldset className={SECTION}>
            <legend className="sr-only">{T.statusTitle}</legend>
            <p className="text-xl font-bold">{T.statusTitle}</p>
            <label className={ROW}>
              <input type="checkbox" checked disabled className={CHECK} />
              {T.pending}
              <span className="text-base text-gray-500">{T.pendingLocked}</span>
            </label>
            <label className={ROW}>
              <input
                type="checkbox"
                className={CHECK}
                checked={settings.showPreparing}
                onChange={(e) => change({ showPreparing: e.target.checked })}
              />
              {T.preparing}
            </label>
            <label className={ROW}>
              <input
                type="checkbox"
                className={CHECK}
                checked={settings.showReady}
                onChange={(e) => change({ showReady: e.target.checked })}
              />
              {T.ready}
            </label>
          </fieldset>
          <fieldset className={SECTION}>
            <legend className="sr-only">{T.positionTitle}</legend>
            <p className="text-xl font-bold">{T.positionTitle}</p>
            <div className="grid grid-cols-2">
              {WIDGET_POSITIONS.map((p) => (
                <label key={p} className={ROW}>
                  <input
                    type="radio"
                    name="widget-position"
                    className={CHECK}
                    checked={settings.position === p}
                    onChange={() => change({ position: p })}
                  />
                  {T.positions[p]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className={SECTION}>
            <label htmlFor="widget-volume" className="text-xl font-bold">
              {T.volumeTitle}
            </label>
            <div className="flex items-center gap-4">
              <input
                id="widget-volume"
                type="range"
                className={SLIDER}
                min={VOLUME_MIN}
                max={VOLUME_MAX}
                step={VOLUME_STEP}
                value={settings.volume}
                onChange={(e) => change({ volume: Number(e.target.value) })}
              />
              <output
                htmlFor="widget-volume"
                className="w-12 text-right text-2xl font-bold"
              >
                {settings.volume}
              </output>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={PREVIEW_BUTTON}
                onClick={() => sound?.playNewOrder()}
              >
                {T.previewNewOrder}
              </button>
              <button
                type="button"
                className={PREVIEW_BUTTON}
                onClick={() => sound?.playWarning()}
              >
                {T.previewWarning}
              </button>
            </div>
          </div>
        </div>
        <div className={SECTION}>
          <WidgetPreview
            position={settings.position}
            statuses={widgetStatuses(settings)}
          />
        </div>
      </div>
      {toastNo > 0 && (
        <Toast key={toastNo} message={T.saved} onClose={closeToast} />
      )}
    </div>
  );
}
