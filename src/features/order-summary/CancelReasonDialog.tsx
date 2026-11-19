// 주문취소 사유 팝업 (SPEC-order-summary 3장). orderId와 콜백만 받고 useOrders()로 요청하므로, OrdersProvider 안이면 T06 위젯에서도 쓸 수 있다.
// 사유 원문(직접 입력은 개인정보가 섞일 수 있다)은 로그에 남기지 않는다: 이 파일은 로그를 부르지 않는다.
import { useEffect, useId, useRef, useState } from "react";
import { ORDER_MESSAGES } from "../../shared/orders/order-texts";
import { useOrders } from "../../shared/orders/orders-context";
import { CANCEL_TEXTS } from "./summary-texts";
import {
  CANCEL_REASON_MAX,
  CUSTOM_REASON,
  clampReason,
  countChars,
  resolveReason,
  type ReasonChoice,
} from "./summary-logic";

interface Props {
  orderId: string;
  /** [닫기] · Esc. 아무것도 취소하지 않고 돌아간다. */
  onBack(): void;
  /** 서버가 취소를 받아 줬다. 부르는 쪽이 자기 팝업도 닫는다. */
  onCancelled(): void;
  /** 실패 문구. 부르는 쪽이 「#번호 …」 토스트로 보인다. */
  onError(orderId: string, message: string): void;
  /** 요청을 보내기 직전. 이 PC가 취소를 보낸 것을 부르는 쪽이 알아야, 그 결과로 팝업이 닫혀도 「다른 PC」 안내를 안 띄운다. */
  onRequest?(orderId: string): void;
}

export function CancelReasonDialog({
  orderId,
  onBack,
  onCancelled,
  onError,
  onRequest,
}: Props) {
  const { changeStatus, inFlight } = useOrders();
  const [selected, setSelected] = useState<ReasonChoice | null>(null);
  const [custom, setCustom] = useState("");
  const [tooLong, setTooLong] = useState(false);
  const [pending, setPending] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  // 한글 조합 중에 값을 잘라 넣으면 글자가 깨지므로, 조합이 끝난 뒤에 자른다.
  const composing = useRef(false);
  function applyCustom(raw: string) {
    const next = clampReason(raw);
    setCustom(next.text);
    setTooLong(next.truncated);
  }
  const titleId = useId();
  const busy = pending || !!inFlight[orderId];
  const reason = resolveReason(selected, custom);

  // 실수로 Enter를 눌러 취소되지 않게 처음 초점은 [닫기]. 닫히면 열기 전 자리(요약 팝업의 [주문취소])로 돌린다.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    backRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onBack();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onBack]);

  async function submit() {
    if (reason === null || busy) return;
    setPending(true);
    onRequest?.(orderId);
    let result: Awaited<ReturnType<typeof changeStatus>>;
    try {
      result = await changeStatus(orderId, "cancel", reason);
    } catch {
      // changeStatus는 던지지 않는 계약이지만, 던지면 버튼이 굳어 팝업에 갇히므로 실패로 보이고 풀어 준다. 사유는 남긴다.
      setPending(false);
      return onError(orderId, ORDER_MESSAGES.failed);
    }
    setPending(false);
    if (result.ok) return onCancelled();
    // 요청 중이라 거절된 것(busy)은 조용히 넘긴다. 사유는 그대로 남는다.
    if (result.reason === "busy") return;
    onError(
      orderId,
      "message" in result ? result.message : ORDER_MESSAGES.failed,
    );
  }

  const radio = "flex min-h-14 items-center gap-3 rounded-lg px-2 text-xl";
  return (
    // 바깥 영역을 눌러도 닫지 않는다: 잘못 닫아 사유를 다시 고르는 일을 막는다.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-[32rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-8 shadow-xl"
      >
        <h2 id={titleId} className="text-2xl font-bold text-gray-900">
          {CANCEL_TEXTS.title}
        </h2>
        <p className="mt-2 text-lg text-gray-600">{CANCEL_TEXTS.guide}</p>
        <div role="radiogroup" aria-label={CANCEL_TEXTS.guide} className="mt-3">
          {CANCEL_TEXTS.reasons.map((text) => (
            <label key={text} className={radio}>
              <input
                type="radio"
                name="cancel-reason"
                checked={selected === text}
                disabled={busy}
                onChange={() => setSelected(text)}
                className="size-6"
              />
              {text}
            </label>
          ))}
          <label className={radio}>
            <input
              type="radio"
              name="cancel-reason"
              checked={selected === CUSTOM_REASON}
              disabled={busy}
              onChange={() => setSelected(CUSTOM_REASON)}
              className="size-6"
            />
            {CANCEL_TEXTS.custom}
          </label>
        </div>
        <input
          type="text"
          aria-label={CANCEL_TEXTS.customLabel}
          value={custom}
          disabled={selected !== CUSTOM_REASON || busy}
          onChange={(e) => {
            // maxLength 대신 직접 자른다: 이모지 · 합친 글자를 1자로 세는 기준(Q40)이 브라우저 기본과 다르다.
            if (composing.current) setCustom(e.target.value);
            else applyCustom(e.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            applyCustom(e.currentTarget.value);
          }}
          className="mt-2 min-h-14 w-full rounded-lg border border-gray-300 px-3 text-xl disabled:bg-gray-100"
        />
        <p className="mt-1 text-base text-gray-600">
          {CANCEL_TEXTS.customNotice}{" "}
          <span aria-hidden="true">
            ({countChars(custom)}/{CANCEL_REASON_MAX})
          </span>
        </p>
        {tooLong && (
          <p role="status" className="text-base font-bold text-red-600">
            {CANCEL_TEXTS.tooLong}
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-4">
          <button
            ref={backRef}
            type="button"
            disabled={busy}
            onClick={onBack}
            className="h-16 rounded-xl border border-gray-300 bg-white text-xl text-gray-700 disabled:opacity-50"
          >
            {CANCEL_TEXTS.back}
          </button>
          <button
            type="button"
            disabled={reason === null || busy}
            onClick={submit}
            className="h-16 rounded-xl bg-red-600 text-xl font-bold text-white disabled:opacity-50"
          >
            {busy ? CANCEL_TEXTS.busy : CANCEL_TEXTS.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
