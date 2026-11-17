// 환경설정 > 프린터설정 화면 (화면정의서 p.19, 스펙 2장). 바꾸면 바로 이 PC에 저장한다.
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PrinterApi,
  PrinterSettingsStore,
} from "../../shared/printer/printer-api";
import {
  assignPrinter,
  createEmptyPrinterSettings,
  isPrinterTaken,
  removePrinter,
  updateSlot,
  type PrinterSettings,
  type SlotIndex,
} from "../../shared/printer/printer-settings";
import { PrinterPickerDialog } from "./PrinterPickerDialog";
import { PrinterSlotCard } from "./PrinterSlotCard";
import { PRINTER_TEXTS } from "./printer-texts";
import { buildTestPageLines } from "./test-page";

const SLOT_INDEXES: SlotIndex[] = [0, 1, 2];

interface Props {
  printerApi: PrinterApi;
  store: PrinterSettingsStore;
  /** 거짓이면 설정은 못 바꾸고 시험 인쇄만 한다 (스펙 2.4). */
  canEdit: boolean;
  storeName: string;
}

export function PrinterSettingsScreen({
  printerApi,
  store,
  canEdit,
  storeName,
}: Props) {
  const [settings, setSettings] = useState<PrinterSettings | null>(null);
  // "(찾을 수 없음)" 판단용. 목록을 못 읽었으면 null로 두고 아무것도 표시하지 않는다.
  const [installed, setInstalled] = useState<string[] | null>(null);
  const [picking, setPicking] = useState<SlotIndex | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  // 설정 파일을 읽지 못했으면 칸을 비운 채 모든 고치기를 막는다. 멀쩡한 파일을 빈 값으로 덮어쓰지 않게 한다 (스펙 2.5).
  // 탭을 다시 열면 이 화면이 새로 그려져 다시 읽는다.
  const [loadFailed, setLoadFailed] = useState(false);
  // 저장 요청 번호. 앞선 저장이 늦게 실패해도 그 뒤에 바꾼 값을 덮어 되돌리지 않게 한다.
  const saveSeqRef = useRef(0);
  // 마지막으로 저장에 성공했거나 처음 읽어 온 값. 저장 실패 때 화면을 이 값으로 되돌린다.
  const savedRef = useRef<PrinterSettings | null>(null);

  useEffect(() => {
    let disposed = false;
    store.load().then(
      (loaded) => {
        if (disposed) return;
        savedRef.current = loaded;
        setSettings(loaded);
      },
      (error: unknown) => {
        console.error("[printer-settings] 설정 읽기 실패", error);
        if (disposed) return;
        setLoadFailed(true);
        setSettings(createEmptyPrinterSettings());
      },
    );
    printerApi.listPrinters().then(
      (names) => {
        if (!disposed) setInstalled(names);
      },
      (error: unknown) =>
        console.error("[printer] 프린터 목록 읽기 실패", error),
    );
    return () => {
      disposed = true;
    };
  }, [printerApi, store]);

  const loadPrinters = useCallback(async () => {
    const names = await printerApi.listPrinters();
    setInstalled(names);
    return names;
  }, [printerApi]);

  if (!settings) return null;
  const current = settings;

  function apply(next: PrinterSettings) {
    const seq = ++saveSeqRef.current;
    setSettings(next);
    setSaveFailed(false);
    store.save(next).then(
      () => {
        // printer_settings.rs의 저장이 동기 명령이라 도착 순서대로 처리되므로, 성공할 때마다 파일 내용은 이 값이다.
        savedRef.current = next;
      },
      (error: unknown) => {
        console.error("[printer-settings] 설정 저장 실패", error);
        if (seq !== saveSeqRef.current) return;
        setSettings(savedRef.current ?? current);
        setSaveFailed(true);
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-gray-50 p-6">
      {!canEdit && (
        // 왜 버튼이 흐린지 점원이 알 수 있게 계속 보인다. 누를 것이 없는 안내 글이다 (스펙 2.4).
        <p className="rounded-xl bg-blue-50 px-4 py-3 text-xl text-blue-800">
          {PRINTER_TEXTS.storeAccountNotice}
        </p>
      )}
      {loadFailed && (
        <p role="alert" className="text-xl text-red-600">
          {PRINTER_TEXTS.loadFailed}
        </p>
      )}
      {saveFailed && (
        <p role="alert" className="text-xl text-red-600">
          {PRINTER_TEXTS.saveFailed}
        </p>
      )}
      {SLOT_INDEXES.map((index) => {
        const slot = current.slots[index];
        return (
          <PrinterSlotCard
            // 다른 프린터로 바뀌면 시험 인쇄 결과 문구가 남지 않게 새로 그린다.
            key={`${index}:${slot?.printerName ?? ""}`}
            number={index + 1}
            slot={slot}
            notFound={
              slot !== null &&
              installed !== null &&
              !installed.includes(slot.printerName)
            }
            canEdit={canEdit && !loadFailed}
            onAdd={() => setPicking(index)}
            onRemove={() => apply(removePrinter(current, index))}
            onChange={(patch) => apply(updateSlot(current, index, patch))}
            onTestPrint={() =>
              slot
                ? printerApi.printTestPage(
                    slot.printerName,
                    buildTestPageLines({
                      printerName: slot.printerName,
                      purpose: slot.purpose,
                      storeName,
                      now: new Date(),
                    }),
                  )
                : Promise.reject(new Error("빈 칸은 시험 인쇄할 수 없습니다."))
            }
          />
        );
      })}
      <div className="rounded-2xl bg-white p-6 text-lg text-gray-600">
        <p className="font-bold text-gray-800">{PRINTER_TEXTS.guideTitle}</p>
        {PRINTER_TEXTS.guideLines.map((line) => (
          <p key={line} className="mt-1">
            {line}
          </p>
        ))}
      </div>
      {picking !== null && (
        <PrinterPickerDialog
          loadPrinters={loadPrinters}
          isTaken={(name) => isPrinterTaken(current, name)}
          onSelect={(name) => {
            setPicking(null);
            apply(assignPrinter(current, picking, name));
          }}
          onCancel={() => setPicking(null)}
        />
      )}
    </div>
  );
}
