// 프린터 칸 하나 (스펙 2.1). 저장은 하지 않고 바뀐 값만 위로 올린다.
import { useId, useRef, useState } from "react";
import type {
  PrinterSlot,
  SlotPatch,
} from "../../shared/printer/printer-settings";
import { PRINTER_TEXTS } from "./printer-texts";

type TestPrintState = "idle" | "sending" | "sent" | "failed";

interface Props {
  number: number;
  slot: PrinterSlot | null;
  /** 지금 Windows 목록에 없는 프린터인지 (스펙 2.5). */
  notFound: boolean;
  canEdit: boolean;
  onAdd(): void;
  onRemove(): void;
  onChange(patch: SlotPatch): void;
  onTestPrint(): Promise<void>;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  );
}

function PurposeField({
  purpose,
  canEdit,
  onSave,
}: {
  purpose: string;
  canEdit: boolean;
  onSave(purpose: string): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // Enter · Esc 뒤에 입력칸이 사라지며 blur가 한 번 더 올 수 있어, 한 번만 끝내도록 둔다.
  const finishedRef = useRef(false);

  function start() {
    finishedRef.current = false;
    setDraft(purpose);
  }

  function finish(save: boolean) {
    if (finishedRef.current || draft === null) return;
    finishedRef.current = true;
    const next = draft.trim();
    setDraft(null);
    if (save && next !== purpose) onSave(next);
  }

  return (
    <div className="flex items-center gap-2">
      {draft === null ? (
        <span
          className={`flex h-14 flex-1 items-center rounded-lg bg-gray-100 px-4 text-xl ${purpose ? "text-gray-900" : "text-gray-400"}`}
        >
          {purpose || PRINTER_TEXTS.purposePlaceholder}
        </span>
      ) : (
        <input
          aria-label="용도 이름"
          autoFocus
          value={draft}
          placeholder={PRINTER_TEXTS.purposePlaceholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // 한글 조합 중 Enter는 글자 확정용이라 저장하지 않는다.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) finish(true);
            if (e.key === "Escape") finish(false);
          }}
          onBlur={() => finish(true)}
          className="h-14 flex-1 rounded-lg border-2 border-blue-500 bg-white px-4 text-xl text-gray-900 outline-none"
        />
      )}
      <button
        type="button"
        aria-label="용도 이름 고치기"
        disabled={!canEdit || draft !== null}
        onClick={start}
        className="flex size-14 items-center justify-center rounded-lg border border-gray-300 text-gray-600 active:bg-gray-100 disabled:opacity-40"
      >
        <PencilIcon />
      </button>
    </div>
  );
}

export function PrinterSlotCard({
  number,
  slot,
  notFound,
  canEdit,
  onAdd,
  onRemove,
  onChange,
  onTestPrint,
}: Props) {
  const headingId = useId();
  const [testPrint, setTestPrint] = useState<TestPrintState>("idle");
  // 렌더를 기다리지 않고 바로 두 번 누르는 것을 막는다.
  const sendingRef = useRef(false);

  const title = slot
    ? `슬롯 ${number} — ${slot.printerName}${notFound ? ` ${PRINTER_TEXTS.notFound}` : ""}`
    : `슬롯 ${number} — ${PRINTER_TEXTS.noPrinter}`;

  async function sendTestPrint() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setTestPrint("sending");
    try {
      await onTestPrint();
      setTestPrint("sent");
    } catch (error) {
      console.error("[printer] 시험 인쇄 실패", error);
      setTestPrint("failed");
    } finally {
      sendingRef.current = false;
    }
  }

  return (
    <section
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6"
    >
      <h3 id={headingId} className="text-2xl font-bold text-gray-900">
        {title}
      </h3>
      {slot ? (
        <>
          <PurposeField
            purpose={slot.purpose}
            canEdit={canEdit}
            onSave={(purpose) => onChange({ purpose })}
          />
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xl text-gray-800">
            <span className="text-gray-500">{PRINTER_TEXTS.printItems}</span>
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-7"
                checked={slot.printOrder}
                disabled={!canEdit}
                onChange={(e) => onChange({ printOrder: e.target.checked })}
              />
              {PRINTER_TEXTS.printOrder}
            </label>
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="size-7"
                checked={slot.printReceipt}
                disabled={!canEdit}
                onChange={(e) => onChange({ printReceipt: e.target.checked })}
              />
              {PRINTER_TEXTS.printReceipt}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={testPrint === "sending"}
              onClick={sendTestPrint}
              className="h-14 rounded-xl border border-gray-300 px-6 text-xl text-gray-800 active:bg-gray-100 disabled:opacity-50"
            >
              {PRINTER_TEXTS.testPrint}
            </button>
            <button
              type="button"
              disabled={!canEdit}
              onClick={onRemove}
              className="h-14 rounded-xl border-2 border-red-500 px-6 text-xl text-red-600 active:bg-red-50 disabled:opacity-40"
            >
              {PRINTER_TEXTS.disconnect}
            </button>
            <p role="status" className="text-lg">
              {testPrint === "sent" && (
                <span className="text-gray-700">
                  {PRINTER_TEXTS.testPrintSent}
                </span>
              )}
              {testPrint === "failed" && (
                <span className="text-red-600">
                  {PRINTER_TEXTS.testPrintFailed}
                </span>
              )}
            </p>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={onAdd}
          className="h-16 rounded-xl border-2 border-blue-500 text-xl font-bold text-blue-600 active:bg-blue-50 disabled:opacity-40"
        >
          {PRINTER_TEXTS.addPrinter}
        </button>
      )}
    </section>
  );
}
