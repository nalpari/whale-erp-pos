// 매장정보 화면 (SPEC-store-info). 열 때 서버에서 읽고, [저장]으로 고객 앱에 반영한다.
// 소개 · 공지 본문은 로그에 남기지 않는다: 남기는 것은 실패 원인 이름과 저장 성공 한 줄뿐이다 (SPEC-store-info 7장).
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  StoreInfo,
  StoreInfoApi,
  TagGroup,
} from "../../shared/api/store-info";
import {
  RequestTimeoutError,
  withTimeout,
} from "../../shared/api/with-timeout";
import { errorSummary } from "../../shared/error-summary";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { Toast } from "../../shared/ui/Toast";
import { countChars } from "../order-summary/summary-logic";
import {
  clampField,
  INTRO_LIMIT,
  introMissing,
  isDirty,
  NOTICE_LIMIT,
  type FieldLimit,
  type FieldNotice,
} from "./store-info-logic";
import { STORE_INFO_TEXTS as T } from "./store-info-texts";

interface Props {
  api: StoreInfoApi;
  /** 저장하지 않은 변경이 있는지 알린다. 다른 탭으로 갈 때 확인창을 띄우는 쪽이 쓴다 (SPEC-store-info 11장 A). */
  onDirtyChange(dirty: boolean): void;
  /** 저장 요청이 가는 중인지 알린다. 그동안 메인 탭 이동을 막아 성공 · 실패 토스트가 사라지지 않게 한다. */
  onSavingChange(saving: boolean): void;
}

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; tagGroups: TagGroup[] };

const NO_NOTICE: FieldNotice = { tooLong: false, tooManyLines: false };

function logFailure(action: "load" | "save", error: unknown) {
  void logInfo(
    logMessages.storeInfoFailed(
      action,
      error instanceof RequestTimeoutError,
      errorSummary(error).name,
    ),
  );
}

export function StoreInfoScreen({ api, onDirtyChange, onSavingChange }: Props) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reloadSeq, setReloadSeq] = useState(0);
  const [saved, setSaved] = useState<StoreInfo | null>(null);
  const [draft, setDraft] = useState<StoreInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  );
  const [notices, setNotices] = useState<{
    intro: FieldNotice;
    notice: FieldNotice;
  }>({ intro: NO_NOTICE, notice: NO_NOTICE });

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setReloadSeq((n) => n + 1);
  }, []);

  useEffect(() => {
    let current = true;
    // async로 감싸, 구현이 Promise 대신 바로 던져도 읽기 실패 길로 간다.
    withTimeout((async () => api.load())()).then(
      (data) => {
        if (!current) return;
        setSaved(data.info);
        setDraft(data.info);
        setLoad({ status: "ready", tagGroups: data.tagGroups });
      },
      (error: unknown) => {
        if (!current) return;
        logFailure("load", error);
        setLoad({ status: "error" });
      },
    );
    return () => {
      current = false;
    };
  }, [api, reloadSeq]);

  const dirty = saved !== null && draft !== null && isDirty(saved, draft);
  // 최신 콜백을 ref에 두어, 부모가 렌더마다 새 함수를 넘겨도 아래 효과가 다시 돌지 않게 한다.
  const onDirtyRef = useRef(onDirtyChange);
  const onSavingRef = useRef(onSavingChange);
  useEffect(() => {
    onDirtyRef.current = onDirtyChange;
    onSavingRef.current = onSavingChange;
  });
  useEffect(() => {
    onDirtyRef.current(dirty);
  }, [dirty]);
  useEffect(() => {
    onSavingRef.current(saving);
  }, [saving]);
  // 화면이 내려가면(탭 이동 · 로그아웃) 변경도 사라지므로, 확인창이 남지 않고 탭이 막히지 않게 부모에게 "바뀐 것 없음 · 저장 중 아님"을 알린다.
  useEffect(
    () => () => {
      onDirtyRef.current(false);
      onSavingRef.current(false);
    },
    [],
  );

  if (load.status !== "ready" || !draft || !saved) {
    if (load.status === "error") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-xl text-gray-700">{T.loadFailed}</p>
          <button
            type="button"
            onClick={retry}
            className="h-14 rounded-xl bg-blue-600 px-8 text-xl font-bold text-white"
          >
            {T.retry}
          </button>
        </div>
      );
    }
    return (
      <p role="status" className="p-8 text-xl text-gray-500">
        {T.loading}
      </p>
    );
  }

  const form = draft;
  const missing = introMissing(form.intro);
  const canSave = dirty && !missing && !saving;

  function showToast(message: string) {
    setToast({ id: Date.now(), message });
  }

  async function save() {
    if (!canSave) return;
    const sent = form;
    setSaving(true);
    try {
      await withTimeout(api.save(sent));
      void logInfo(logMessages.storeInfoSaved());
      setSaved(sent);
      showToast(T.saved);
    } catch (error) {
      logFailure("save", error);
      showToast(T.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(code: string) {
    setDraft((d) =>
      d
        ? {
            ...d,
            selectedTags: d.selectedTags.includes(code)
              ? d.selectedTags.filter((c) => c !== code)
              : [...d.selectedTags, code],
          }
        : d,
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-8">
      <p className="text-lg text-gray-600">{T.guide}</p>
      <fieldset disabled={saving} className="mt-6 flex flex-col gap-8">
        <TextSection
          label={T.intro}
          required
          limit={INTRO_LIMIT}
          value={form.intro}
          notice={notices.intro}
          error={missing ? T.introRequired : null}
          onChange={(intro, notice) => {
            setDraft({ ...form, intro });
            setNotices((n) => ({ ...n, intro: notice }));
          }}
        />
        <TextSection
          label={T.notice}
          limit={NOTICE_LIMIT}
          value={form.notice}
          notice={notices.notice}
          error={null}
          visibility={{
            on: form.noticeVisible,
            onChange: (noticeVisible) => setDraft({ ...form, noticeVisible }),
          }}
          onChange={(notice, flags) => {
            setDraft({ ...form, notice });
            setNotices((n) => ({ ...n, notice: flags }));
          }}
        />
        <section aria-labelledby="store-info-tags">
          <div className="flex items-center justify-between">
            <h2
              id="store-info-tags"
              className="text-xl font-bold text-gray-900"
            >
              {T.tags}
            </h2>
            <VisibleSwitch
              label={T.tags}
              on={form.tagsVisible}
              onChange={(tagsVisible) => setDraft({ ...form, tagsVisible })}
            />
          </div>
          {load.tagGroups.map((group) => (
            <div key={group.name} className="mt-3">
              <h3 className="text-lg font-bold text-gray-600">{group.name}</h3>
              <div className="flex flex-wrap gap-x-6">
                {group.tags.map((tag) => (
                  <label
                    key={tag.code}
                    className="flex min-h-12 items-center gap-3 text-xl"
                  >
                    <input
                      type="checkbox"
                      checked={form.selectedTags.includes(tag.code)}
                      onChange={() => toggleTag(tag.code)}
                      className="size-7"
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </section>
        <button
          type="button"
          disabled={!canSave}
          onClick={save}
          className="h-16 w-48 self-end rounded-xl bg-blue-600 text-xl font-bold text-white disabled:opacity-50"
        >
          {saving ? T.saving : T.save}
        </button>
      </fieldset>
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

function VisibleSwitch({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange(on: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} ${T.shown}`}
      onClick={() => onChange(!on)}
      className={`h-12 min-w-32 rounded-full px-6 text-lg font-bold ${
        on ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
      }`}
    >
      {on ? T.shown : T.hidden}
    </button>
  );
}

interface TextSectionProps {
  label: string;
  required?: boolean;
  limit: FieldLimit;
  value: string;
  notice: FieldNotice;
  error: string | null;
  /** 앱에 표시 토글. 점포 소개처럼 토글이 없는 칸은 비운다. */
  visibility?: { on: boolean; onChange(on: boolean): void };
  onChange(value: string, notice: FieldNotice): void;
}

function TextSection({
  label,
  required,
  limit,
  value,
  notice,
  error,
  visibility,
  onChange,
}: TextSectionProps) {
  const id = useId();
  // 한글 조합 중에 값을 잘라 넣으면 글자가 깨지므로, 조합이 끝난 뒤에 자른다 (T05와 같음).
  const composing = useRef(false);
  // 조합이 시작될 때의 값: 끝날 때 이것과 비교해야, 가운데에 친 글자만 자르고 원래 글은 지키지 않는다.
  const composeBase = useRef("");
  function apply(raw: string, prev?: string) {
    const next = clampField(raw, limit, prev);
    onChange(next.text, {
      tooLong: next.tooLong,
      tooManyLines: next.tooManyLines,
    });
  }
  return (
    <section aria-labelledby={id}>
      <div className="flex items-center justify-between">
        <h2 id={id} className="text-xl font-bold text-gray-900">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </h2>
        {visibility && (
          <VisibleSwitch
            label={label}
            on={visibility.on}
            onChange={visibility.onChange}
          />
        )}
      </div>
      <textarea
        aria-labelledby={id}
        rows={limit.lines}
        value={value}
        onChange={(e) => {
          if (composing.current) onChange(e.target.value, notice);
          else apply(e.target.value, value);
        }}
        onCompositionStart={() => {
          composing.current = true;
          composeBase.current = value;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          apply(e.currentTarget.value, composeBase.current);
        }}
        className="mt-2 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-xl"
      />
      <p className="text-base text-gray-600">
        {countChars(value)} / {limit.chars}자
      </p>
      {error && (
        <p role="alert" className="text-base font-bold text-red-600">
          {error}
        </p>
      )}
      {notice.tooLong && (
        <p role="status" className="text-base font-bold text-red-600">
          {T.tooLong(limit.chars)}
        </p>
      )}
      {notice.tooManyLines && (
        <p role="status" className="text-base font-bold text-red-600">
          {T.tooManyLines(limit.lines)}
        </p>
      )}
    </section>
  );
}
