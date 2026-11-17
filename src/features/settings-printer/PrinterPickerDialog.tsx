// 프린터 선택 팝업 (스펙 2.2). 열 때마다 Windows 프린터 목록을 새로 읽는다.
import { useEffect, useId, useState } from "react";
import { PRINTER_TEXTS } from "./printer-texts";

type ListState =
  | { status: "loading" }
  | { status: "loaded"; printers: string[] }
  | { status: "error" };

interface Props {
  loadPrinters(): Promise<string[]>;
  /** 다른 칸에 이미 등록된 프린터인지. 참이면 누를 수 없다. */
  isTaken(printerName: string): boolean;
  onSelect(printerName: string): void;
  onCancel(): void;
}

export function PrinterPickerDialog({
  loadPrinters,
  isTaken,
  onSelect,
  onCancel,
}: Props) {
  const titleId = useId();
  const [list, setList] = useState<ListState>({ status: "loading" });

  useEffect(() => {
    let disposed = false;
    loadPrinters().then(
      (printers) => {
        if (!disposed) setList({ status: "loaded", printers });
      },
      (error: unknown) => {
        console.error("[printer] 프린터 목록 읽기 실패", error);
        if (!disposed) setList({ status: "error" });
      },
    );
    return () => {
      disposed = true;
    };
  }, [loadPrinters]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100vh-2rem)] w-[32rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-white p-8 shadow-xl"
      >
        <h2 id={titleId} className="text-2xl font-bold text-gray-900">
          {PRINTER_TEXTS.pickerTitle}
        </h2>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
          {list.status === "error" && (
            <p className="py-6 text-lg text-red-600">
              {PRINTER_TEXTS.listFailed}
            </p>
          )}
          {list.status === "loaded" && list.printers.length === 0 && (
            <p className="py-6 text-lg text-gray-600">
              {PRINTER_TEXTS.noInstalledPrinters}
            </p>
          )}
          {list.status === "loaded" && list.printers.length > 0 && (
            <ul className="flex flex-col gap-2">
              {list.printers.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    disabled={isTaken(name)}
                    onClick={() => onSelect(name)}
                    className="min-h-14 w-full rounded-xl border border-gray-300 px-4 text-left text-xl text-gray-900 active:bg-blue-50 disabled:text-gray-400 disabled:opacity-50"
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-6 h-16 rounded-xl border border-gray-300 bg-white text-xl text-gray-700 active:bg-gray-50"
        >
          {PRINTER_TEXTS.cancel}
        </button>
      </div>
    </div>
  );
}
