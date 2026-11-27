// 환경설정 > 주문설정 화면 (SPEC-settings-order). 열 때 서버에서 읽고, 바꾸면 바로 서버에 저장한다 (위젯 · 프린터설정과 같은 방식).
// 두 계정 모두 바꿀 수 있다 (스펙 2장). 점포 단위 값이라 이 PC에는 저장하지 않는다.
import { useEffect, useRef, useState } from "react";
import {
  ORDER_SETTING_MINUTES,
  type OrderSettingMinutes,
  type OrderSettings,
  type OrderSettingsApi,
} from "../../shared/api/order-settings";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { errorSummary } from "../../shared/error-summary";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { Toast } from "../../shared/ui/Toast";
import { ORDER_SETTINGS_TEXTS as T } from "./order-settings-texts";

type Item = keyof OrderSettings;

function logFailure(action: "load" | "save", error: unknown) {
  void logInfo(
    logMessages.orderSettingsFailed(
      action,
      error instanceof RequestTimeoutError,
      errorSummary(error).name,
    ),
  );
}

interface Props {
  api: OrderSettingsApi;
  /** 저장 요청이 가는 중인지 알린다. 그동안 탭 이동을 막아, 다시 열어 겹쳐 저장하거나 결과 토스트를 놓치지 않게 한다 (매장정보와 같음). */
  onSavingChange(saving: boolean): void;
}

export function OrderSettingsScreen({ api, onSavingChange }: Props) {
  const [settings, setSettings] = useState<OrderSettings | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  // 마지막으로 서버에서 확인한 값(읽기 · 저장 성공 · 시간 초과 뒤 다시 읽기). 저장 실패 때 이 값으로 되돌린다.
  const savedRef = useRef<OrderSettings | null>(null);
  // 저장은 한 번에 하나만 보낸다: 요청이 겹치면 서버가 처리한 순서와 화면 값이 어긋날 수 있다(자동 취소 = 환불 시각이라 어긋나면 안 된다).
  const [saving, setSaving] = useState(false);

  // 최신 콜백을 ref에 두어, 부모가 렌더마다 새 함수를 넘겨도 아래 효과가 다시 돌지 않게 한다.
  const onSavingRef = useRef(onSavingChange);
  useEffect(() => {
    onSavingRef.current = onSavingChange;
  });
  useEffect(() => {
    onSavingRef.current(saving);
  }, [saving]);
  useEffect(() => () => onSavingRef.current(false), []);

  useEffect(() => {
    let current = true;
    // async로 감싸, 구현이 Promise 대신 바로 던져도 읽기 실패 길로 간다.
    withTimeout((async () => api.load())()).then(
      (loaded) => {
        if (!current) return;
        savedRef.current = loaded;
        setSettings(loaded);
      },
      (error: unknown) => {
        logFailure("load", error);
        if (current) setLoadFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [api, reloadSeq]);

  if (loadFailed) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-xl text-gray-700">{T.loadFailed}</p>
        <button
          type="button"
          onClick={() => {
            setLoadFailed(false);
            setReloadSeq((n) => n + 1);
          }}
          className="h-14 rounded-xl bg-blue-600 px-8 text-xl font-bold text-white"
        >
          {T.retry}
        </button>
      </div>
    );
  }
  if (!settings) {
    return (
      <p role="status" className="p-8 text-xl text-gray-500">
        {T.loading}
      </p>
    );
  }
  const shown = settings;

  function change(item: Item, minutes: OrderSettingMinutes) {
    if (saving || shown[item] === minutes) return;
    const next = { ...shown, [item]: minutes };
    setSaving(true);
    setSettings(next);
    withTimeout((async () => api.save(next))()).then(
      () => {
        savedRef.current = next;
        // 토스트와 같은 렌더에서 풀어, 「저장되었습니다」가 보이는데 선택지가 아직 막혀 있는 틈을 없앤다.
        setSaving(false);
        void logInfo(logMessages.orderSettingsSaved(item, minutes));
        setToast({ id: Date.now(), message: T.saved });
      },
      (error: unknown) => {
        logFailure("save", error);
        setToast({ id: Date.now(), message: T.saveFailed });
        if (!(error instanceof RequestTimeoutError)) {
          setSettings(savedRef.current);
          setSaving(false);
          return;
        }
        // 시간 초과면 서버에는 저장됐을 수 있어, 추측으로 되돌리지 않고 다시 읽어 실제 값을 보인다 (13장 F).
        // 다시 읽는 동안에도 저장 중으로 두어 선택지 · 탭 이동을 막는다.
        withTimeout((async () => api.load())()).then(
          (loaded) => {
            savedRef.current = loaded;
            setSettings(loaded);
            setSaving(false);
          },
          (reloadError: unknown) => {
            logFailure("load", reloadError);
            setSettings(savedRef.current);
            setSaving(false);
          },
        );
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-gray-50 p-6">
      <h2 className="text-2xl font-bold">{T.title}</h2>
      {(["autoCancelMinutes", "arrivalMinMinutes"] as const).map((item) => {
        const texts =
          item === "autoCancelMinutes" ? T.autoCancel : T.arrivalMin;
        return (
          <fieldset
            key={item}
            disabled={saving}
            className="flex flex-col gap-3 rounded-2xl bg-white p-4"
          >
            <legend className="float-left mb-3 w-full text-xl font-bold">
              {texts.label}
            </legend>
            <div className="flex flex-wrap gap-2">
              {ORDER_SETTING_MINUTES.map((m) => (
                // 줄 전체를 눌러도 되게 라디오를 버튼 모양 라벨 안에 둔다 (터치 우선, 44px 이상).
                <label
                  key={m}
                  className="flex min-h-14 min-w-24 items-center justify-center gap-2 rounded-xl border-2 border-gray-300 px-4 text-xl select-none has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:font-bold"
                >
                  <input
                    type="radio"
                    name={item}
                    className="h-6 w-6"
                    checked={shown[item] === m}
                    onChange={() => change(item, m)}
                  />
                  {T.minutes(m)}
                </label>
              ))}
            </div>
            <p className="text-lg text-gray-600">{texts.note}</p>
          </fieldset>
        );
      })}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
