// 화면 아래 배너 쌓기 (SPEC-order-board 2.7). 위로 쌓고 새 배너가 맨 아래에 붙는다. T12 출력 실패 띠도 여기에 붙인다.
import { useEffect, useRef, useState } from "react";
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

export function BottomBanners({ banners, inFlight, onExpire, onUndo }: Props) {
  if (banners.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-col">
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
