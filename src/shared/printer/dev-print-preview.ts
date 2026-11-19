// 개발 모드(import.meta.env.DEV)에서만 쓰는 "출력 미리보기" 저장소 (T12 스펙 11장 C).
// 실제 프린터 대신 받은 줄 목록을 여기에 쌓고, DevPrintPreview 패널이 종이 모양으로 그린다. 그 출력은 성공으로 본다.
// 운영 빌드에서는 printer-api.ts의 DEV 분기와 함께 빠진다.
import type { PrintDocument } from "./print-lines";
import type { PrinterApi } from "./printer-api";

export interface PreviewEntry extends PrintDocument {
  id: number;
  printerName: string;
  at: number;
}

const MAX_ENTRIES = 20;
let entries: PreviewEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export const devPrintPreview = {
  /** useSyncExternalStore용: 바뀔 때만 새 배열이 된다. */
  getSnapshot: () => entries,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  push(printerName: string, doc: PrintDocument) {
    entries = [
      { ...doc, id: nextId++, printerName, at: Date.now() },
      ...entries,
    ].slice(0, MAX_ENTRIES);
    listeners.forEach((l) => l());
  },
  clear() {
    entries = [];
    listeners.forEach((l) => l());
  },
};

/** 실제 출력 대신 미리보기에 쌓는다. Linux 개발 PC는 프린터 목록이 비어 있으므로 시험용 이름을 대신 보인다. */
export function withDevPreview(
  base: PrinterApi,
  fallbackPrinters: string[],
): PrinterApi {
  return {
    listPrinters: async () => {
      const names = await base.listPrinters();
      return names.length > 0 ? names : [...fallbackPrinters];
    },
    printDocument: async (printerName, doc) => {
      devPrintPreview.push(printerName, doc);
    },
    printTestPage: async (printerName, lines, paperWidth = 80) => {
      devPrintPreview.push(printerName, {
        docName: "시험 인쇄",
        paperWidth,
        lines: lines.map((text) => ({ text })),
      });
    },
  };
}
