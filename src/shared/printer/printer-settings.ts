// 프린터 칸 3개의 설정 (스펙 3.1). T12가 주문서 · 영수증을 낼 때 이 모양을 그대로 읽는다.
// 저장 파일 모양(Rust src-tauri/src/printer_settings.rs)과 같게 둔다.

export interface PrinterSlot {
  /** Windows 프린터 이름. 식별자로도 쓴다. */
  printerName: string;
  /** 용도 이름. 빈 값 가능. */
  purpose: string;
  /** 주문서: 주문접수 때 자동 출력 (T12). */
  printOrder: boolean;
  /** 영수증 (고객 요청 시) (T12). */
  printReceipt: boolean;
}

export type SlotIndex = 0 | 1 | 2;

export interface PrinterSettings {
  version: 1;
  slots: [PrinterSlot | null, PrinterSlot | null, PrinterSlot | null];
}

export type SlotPatch = Partial<Omit<PrinterSlot, "printerName">>;

export function createEmptyPrinterSettings(): PrinterSettings {
  return { version: 1, slots: [null, null, null] };
}

/** 어느 칸에든 이미 등록된 프린터인지. 같은 프린터가 두 칸에 들어가면 주문서가 두 번 나온다 (스펙 2.2). */
export function isPrinterTaken(
  settings: PrinterSettings,
  printerName: string,
): boolean {
  return settings.slots.some((slot) => slot?.printerName === printerName);
}

function withSlot(
  settings: PrinterSettings,
  index: SlotIndex,
  slot: PrinterSlot | null,
): PrinterSettings {
  const slots: PrinterSettings["slots"] = [...settings.slots];
  slots[index] = slot;
  return { ...settings, slots };
}

/** 새 칸 기본값: 주문서 자동 출력이 기본 용도라 주문서만 체크한다 (스펙 2.2-5). */
export function assignPrinter(
  settings: PrinterSettings,
  index: SlotIndex,
  printerName: string,
): PrinterSettings {
  if (isPrinterTaken(settings, printerName)) {
    throw new Error("이미 다른 칸에 등록된 프린터입니다.");
  }
  return withSlot(settings, index, {
    printerName,
    purpose: "",
    printOrder: true,
    printReceipt: false,
  });
}

export function removePrinter(
  settings: PrinterSettings,
  index: SlotIndex,
): PrinterSettings {
  return withSlot(settings, index, null);
}

export function updateSlot(
  settings: PrinterSettings,
  index: SlotIndex,
  patch: SlotPatch,
): PrinterSettings {
  const slot = settings.slots[index];
  if (!slot) return settings;
  return withSlot(settings, index, { ...slot, ...patch });
}
