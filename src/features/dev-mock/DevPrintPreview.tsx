// 개발 모드 전용 "출력 미리보기" (T12 스펙 11장 C). 실제 프린터 대신 받은 줄 목록을 종이 모양으로 그린다.
// 운영 빌드에서는 App.tsx의 import.meta.env.DEV 조건과 함께 파일이 통째로 빠진다.
import { useState, useSyncExternalStore } from "react";
import { devPrintPreview } from "../../shared/printer/dev-print-preview";
import { PaperPreview } from "../print-forms/PaperPreview";

const formatTime = (ms: number) => new Date(ms).toLocaleTimeString("ko-KR");

export function DevPrintPreview() {
  const entries = useSyncExternalStore(
    devPrintPreview.subscribe,
    devPrintPreview.getSnapshot,
  );
  const [open, setOpen] = useState(false);

  // 오른쪽 아래: 왼쪽 아래는 가상 주문 패널(DevMockPanel) 자리라 겹치면 가린다.
  return (
    <div className="fixed right-2 bottom-2 z-[60] text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-gray-800 px-3 py-2 font-bold text-white shadow"
      >
        출력 미리보기 ({entries.length})
      </button>
      {open && (
        <section
          aria-label="출력 미리보기"
          className="mt-2 max-h-[70vh] w-[26rem] overflow-y-auto rounded-xl bg-gray-200 p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold">개발용: 실제로는 출력하지 않는다</p>
            <button
              type="button"
              onClick={devPrintPreview.clear}
              className="rounded bg-white px-2 py-1"
            >
              비우기
            </button>
          </div>
          {entries.length === 0 && <p>아직 출력이 없다.</p>}
          <ul className="space-y-4">
            {entries.map((entry) => (
              <li key={entry.id}>
                <p className="mb-1 text-gray-700">
                  {formatTime(entry.at)} · {entry.printerName} ·{" "}
                  {entry.paperWidth}mm · {entry.docName}
                </p>
                <PaperPreview
                  lines={entry.lines}
                  paperWidth={entry.paperWidth}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
