// 프린터 목록 · 시험 인쇄 · 설정 저장 (스펙 3.2). 화면은 이 인터페이스만 부르고 Tauri를 직접 부르지 않는다.
// 실제 일은 Rust(src-tauri/src/printer.rs, printer_settings.rs)가 한다. 테스트 · 브라우저에서는 가짜 구현을 쓴다.
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  createEmptyPrinterSettings,
  type PrinterSettings,
} from "./printer-settings";

export interface PrinterApi {
  /** 이 PC의 Windows에 설치된 프린터 이름. Tauri 구현은 Windows가 아니면 빈 배열. */
  listPrinters(): Promise<string[]>;
  /** 한 줄씩 글자로 그려 인쇄 대기열에 넣는다. 종이가 실제로 나왔는지는 모른다 (Q47). */
  printTestPage(printerName: string, lines: string[]): Promise<void>;
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
    printTestPage: (printerName, lines) =>
      invoke("print_test_page", { printerName, lines }),
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

/** 테스트 · 브라우저 개발 모드용 가짜 프린터. 시험 인쇄는 받은 내용을 기록만 한다. */
export function createFakePrinterApi(
  printers: string[] = MOCK_PRINTER_NAMES,
): PrinterApi & { printed: { printerName: string; lines: string[] }[] } {
  const printed: { printerName: string; lines: string[] }[] = [];
  return {
    printed,
    listPrinters: async () => [...printers],
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
  return isTauri() ? createTauriPrinterApi() : createFakePrinterApi();
}

export function createPrinterSettingsStore(): PrinterSettingsStore {
  return isTauri()
    ? createTauriPrinterSettingsStore()
    : createMemoryPrinterSettingsStore();
}
