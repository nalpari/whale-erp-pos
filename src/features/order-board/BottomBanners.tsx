// 화면 아래 배너 쌓기 (SPEC-order-board 2.7). 위로 쌓고 새 배너가 맨 아래에 붙는다. T12 출력 실패 띠도 여기에 붙인다.
import { useEffect, useRef, useState } from "react";
import type { PrintFailure } from "../print-forms/print-forms-context";
import { PRINT_TEXTS } from "../print-forms/print-texts";
import { BOARD_TEXTS } from "./board-texts";

export interface BoardBanner {
  id: string;
  kind: "pickup" | "customer-cancel";
  orderId: string;
  pickupNumber: number;
  /** 사라질 시각(ms). */
  expiresAt: number;
}

interface Props {
  banners: BoardBanner[];
  /** 요청이 진행 중인 주문. [완료 취소]를 막는다. */
  inFlight: Record<string, true>;
  onExpire(id: string): void;
  onUndo(banner: BoardBanner): void;
  /** 주문서 출력 실패 띠 (T12 스펙 5장). 주문마다 하나, [×]나 다시 인쇄 성공 때까지 남는다. */
  printFailures?: PrintFailure[];
  /** 출력을 보내는 중인 주문: [다시 인쇄]를 막는다. */
  printing?: Readonly<Record<string, true>>;
  onRetryPrint?(orderId: string): void;
  onDismissPrint?(orderId: string): void;
}

const allUnknown = (failure: PrintFailure) =>
  failure.slots.length > 0 && failure.slots.every((s) => s.unknownResult);

/** 「슬롯 1 SEWOO: 이유」를 쉼표로 이은 글. 설정을 못 읽은 실패(슬롯 모름)는 이유만. */
function failureDetail(failure: PrintFailure, allUnknown: boolean): string {
  const parts = failure.slots.map((s) =>
    // 결과를 모르는 슬롯만 있으면 큰 문구가 그 뜻이라 이름만 적고, 다른 실패와 섞이면 이유를 붙여 구분한다.
    s.unknownResult && allUnknown
      ? PRINT_TEXTS.slotOnly(s.index + 1, s.printerName)
      : PRINT_TEXTS.failedSlot(s.index + 1, s.printerName, s.reason),
  );
  if (failure.extraReason) parts.push(failure.extraReason);
  return parts.join(", ");
}

function Banner({
  banner,
  busy,
  onExpire,
  onUndo,
}: {
  banner: BoardBanner;
  busy: boolean;
  onExpire(id: string): void;
  onUndo(banner: BoardBanner): void;
}) {
  const [now, setNow] = useState(Date.now);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    const end = setTimeout(
      () => onExpireRef.current(banner.id),
      Math.max(0, banner.expiresAt - Date.now()),
    );
    return () => {
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [banner.id, banner.expiresAt]);
  const seconds = Math.max(0, Math.ceil((banner.expiresAt - now) / 1000));

  if (banner.kind === "customer-cancel") {
    return (
      <p
        role="status"
        className="bg-red-100 px-6 py-3 text-lg font-bold text-red-800"
      >
        {BOARD_TEXTS.customerCancelBanner(banner.pickupNumber)}
      </p>
    );
  }
  return (
    <div
      role="status"
      className="flex items-center justify-between gap-4 bg-gray-800 px-6 py-2 text-lg text-white"
    >
      <span>{BOARD_TEXTS.pickupBanner(banner.pickupNumber)}</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => onUndo(banner)}
        className="min-h-12 rounded-lg bg-white px-5 font-bold text-gray-900 disabled:opacity-60"
      >
        {BOARD_TEXTS.undoPickup(seconds)}
      </button>
    </div>
  );
}

export function BottomBanners({
  banners,
  inFlight,
  onExpire,
  onUndo,
  printFailures = [],
  printing = {},
  onRetryPrint,
  onDismissPrint,
}: Props) {
  if (banners.length === 0 && printFailures.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col">
      {printFailures.map((failure) => (
        <div
          key={`print-${failure.orderId}`}
          role="alert"
          className="flex items-center justify-between gap-4 bg-red-600 px-6 py-2 text-lg font-bold text-white"
        >
          <span className="break-words">
            #{failure.pickupNumber}{" "}
            {(allUnknown(failure)
              ? PRINT_TEXTS.unknownResultBanner
              : PRINT_TEXTS.orderFailedBanner)(
              failureDetail(failure, allUnknown(failure)),
            )}
          </span>
          <span className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={!!printing[failure.orderId]}
              onClick={() => onRetryPrint?.(failure.orderId)}
              className="min-h-12 rounded-lg bg-white px-5 font-bold text-red-700 disabled:opacity-60"
            >
              {PRINT_TEXTS.retryPrint}
            </button>
            <button
              type="button"
              aria-label={PRINT_TEXTS.dismissBanner}
              onClick={() => onDismissPrint?.(failure.orderId)}
              className="size-12 rounded-lg text-2xl"
            >
              ×
            </button>
          </span>
        </div>
      ))}
      {banners.map((b) => (
        <Banner
          key={b.id}
          banner={b}
          busy={!!inFlight[b.orderId]}
          onExpire={onExpire}
          onUndo={onUndo}
        />
      ))}
    </div>
  );
}
