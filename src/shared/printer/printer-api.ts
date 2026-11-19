// 프린터 목록 · 줄 목록 출력(주문서 · 영수증 · 시험 인쇄) · 설정 저장 (T11 스펙 3.2, T12 스펙 7장). 화면은 이 인터페이스만 부르고 Tauri를 직접 부르지 않는다.
// 실제 일은 Rust(src-tauri/src/printer.rs, printer_settings.rs)가 한다. 테스트 · 브라우저에서는 가짜 구현을 쓴다.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { withDevPreview } from "./dev-print-preview";
import type { PrintDocument, PrintLine } from "./print-lines";
import {
  createEmptyPrinterSettings,
  type PaperWidth,
  type PrinterSettings,
} from "./printer-settings";

export interface PrinterApi {
  /** 이 PC의 Windows에 설치된 프린터 이름. Tauri 구현은 Windows가 아니면 빈 배열. */
  listPrinters(): Promise<string[]>;
  /**
   * 줄 목록을 용지 폭에 맞춰 그려 인쇄 대기열에 넣는다 (주문서 · 영수증). 종이가 실제로 나왔는지는 모른다 (Q47).
   * 실패하면 이유 문구(문자열)로 reject한다: Windows에 넘기지 못한 경우만이다 (T12 스펙 11장 B).
   */
  printDocument(printerName: string, doc: PrintDocument): Promise<void>;
  /** 시험 인쇄: 한 줄씩 글자로 만들어 Tauri 구현은 같은 명령(print_document)에 넘긴다. 용지 폭을 안 주면 80mm. 가짜 구현은 printed에 기록만 하고 폭을 무시한다. */
  printTestPage(
    printerName: string,
    lines: string[],
    paperWidth?: PaperWidth,
  ): Promise<void>;
}

export interface PrinterSettingsStore {
  /**
   * 저장된 설정. 파일이 없거나 모양이 다르면 빈 설정.
   * 그 밖의 읽기 오류(파일을 잡고 있음 등)는 reject한다. 빈 설정으로 덮어쓰지 않게 하려는 것이다 (스펙 2.5).
   */
  load(): Promise<PrinterSettings>;
  save(settings: PrinterSettings): Promise<void>;
}

export function createTauriPrinterApi(): PrinterApi {
  return {
    listPrinters: () => invoke<string[]>("list_printers"),
    printDocument: (printerName, doc) =>
      invoke("print_document", {
        printerName,
        docName: doc.docName,
        paperWidthMm: doc.paperWidth,
        lines: doc.lines,
      }),
    printTestPage: (printerName, lines, paperWidth = 80) =>
      invoke("print_document", {
        printerName,
        docName: "픽업오더 주문접수 시험 인쇄",
        paperWidthMm: paperWidth,
        lines: lines.map((text): PrintLine => ({ text })),
      }),
  };
}

export function createTauriPrinterSettingsStore(): PrinterSettingsStore {
  return {
    load: () => invoke<PrinterSettings>("load_printer_settings"),
    save: (settings) => invoke("save_printer_settings", { settings }),
  };
}

/** 모의 데이터: 브라우저 개발 모드에서 보일 프린터 이름. */
export const MOCK_PRINTER_NAMES = [
  "Microsoft Print to PDF",
  "SLK-TS100",
  "카운터 영수증 프린터",
];

/** 테스트 · 브라우저 개발 모드용 가짜 프린터. 받은 내용을 기록만 한다. */
export function createFakePrinterApi(
  printers: string[] = MOCK_PRINTER_NAMES,
): PrinterApi & {
  printed: { printerName: string; lines: string[] }[];
  documents: { printerName: string; doc: PrintDocument }[];
} {
  const printed: { printerName: string; lines: string[] }[] = [];
  const documents: { printerName: string; doc: PrintDocument }[] = [];
  return {
    printed,
    documents,
    listPrinters: async () => [...printers],
    printDocument: async (printerName, doc) => {
      documents.push({ printerName, doc });
    },
    printTestPage: async (printerName, lines) => {
      printed.push({ printerName, lines });
    },
  };
}

/** 테스트 · 브라우저 개발 모드용. 프로그램을 다시 켜면 사라진다. */
export function createMemoryPrinterSettingsStore(
  initial: PrinterSettings = createEmptyPrinterSettings(),
): PrinterSettingsStore {
  let saved = initial;
  return {
    load: async () => saved,
    save: async (settings) => {
      saved = settings;
    },
  };
}

export function createPrinterApi(): PrinterApi {
  const base = isTauri() ? createTauriPrinterApi() : createFakePrinterApi();
  // 개발 모드에서는 실제 출력 대신 "출력 미리보기"에 그린다 (T12 스펙 11장 C). 운영 빌드에서는 이 분기가 거짓으로 굳어 빠진다.
  return import.meta.env.DEV ? withDevPreview(base, MOCK_PRINTER_NAMES) : base;
}

export function createPrinterSettingsStore(): PrinterSettingsStore {
  return isTauri()
    ? createTauriPrinterSettingsStore()
    : createMemoryPrinterSettingsStore();
}
