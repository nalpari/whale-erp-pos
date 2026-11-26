// 재제조 팝업 (SPEC-remake 3 · 4 · 5장). orderId · 픽업번호 · 콜백만 받고, 요청과 출력은 useOrders() · usePrintForms()로 한다.
// 직접 입력한 사유는 로그에 남기지 않는다: 요청 로그는 order-sync가 사유 번호만 남기고, 이 파일은 뜻밖의 예외에 주문 ID만 남긴다.
import { useEffect, useId, useRef, useState } from "react";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { ORDER_MESSAGES } from "../../shared/orders/order-texts";
import { useOrders } from "../../shared/orders/orders-context";
import { BOARD_TEXTS } from "../order-board/board-texts";
import { usePrintForms } from "../print-forms/print-forms-context";
import { ReasonTextInput } from "./ReasonTextInput";
import { REMAKE_TEXTS } from "./summary-texts";

interface Props {
  orderId: string;
  pickupNumber: number;
  /** 주문 메뉴 줄. 순번(index)이 서버로 가는 줄 번호다. */
  items: readonly { name: string; quantity: number; options?: string[] }[];
  /** [닫기] · Esc · 성공 · 거절. rejected면 부르는 쪽이 최신 상태로 다시 그린다. */
  onClose(result: "back" | "done" | "rejected"): void;
  /** 「#12 …」 토스트. */
  onToast(message: string): void;
}

export function RemakeDialog({
  orderId,
  pickupNumber,
  items,
  onClose,
  onToast,
}: Props) {
  const { remake, inFlight } = useOrders();
  const print = usePrintForms();
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  // 고른 메뉴 줄 → 수량. 처음엔 아무것도 안 고른다 (SPEC-remake 3장 2번).
  const [picked, setPicked] = useState<Record<number, number>>({});
  const pickedItems = Object.entries(picked).map(([index, quantity]) => ({
    itemIndex: Number(index),
    quantity,
  }));
  const [pending, setPending] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const busy = pending || !!inFlight[orderId];
  const choice = selected === null ? null : REMAKE_TEXTS.reasons[selected];
  const text =
    choice === null ? "" : "custom" in choice ? custom.trim() : choice.label;

  // 실수로 Enter를 눌러 재제조되지 않게 처음 초점은 [닫기]. 닫히면 열기 전 자리로 돌린다.
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
      if (event.key === "Escape" && !busy) onClose("back");
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function submit() {
    if (
      choice === null ||
      selected === null ||
      !text ||
      pickedItems.length === 0 ||
      busy
    )
      return;
    setPending(true);
    const result = await remake(
      orderId,
      { text, fault: choice.fault, reasonNo: selected + 1 },
      pickedItems,
    ).catch(() => {
      // remake는 던지지 않는 계약이지만, 던지면 실패로 보이고 풀어 준다. 원인을 찾을 수 있게 주문 ID만 남긴다.
      void logInfo(logMessages.remakeUnexpected(orderId, "request"));
      return null;
    });
    setPending(false);
    if (result?.ok) {
      onClose("done");
      onToast(BOARD_TEXTS.failureToast(pickupNumber, REMAKE_TEXTS.done));
      // 접수 때 주문서와 같은 규칙: 「주문서」 프린터가 없으면 조용히 건너뛰고, 실패는 띠 · 경고음이 알린다.
      void print
        ?.printRemake(result.order, text, pickedItems)
        .catch(
          () => void logInfo(logMessages.remakeUnexpected(orderId, "print")),
        );
      return;
    }
    // busy는 버튼이 막혀 있어 조용히 넘긴다. not-allowed(목록에 없음 · 상태가 어긋남 · 로그아웃 중)는 눌렀는데 반응이 없지 않게 실패로 알린다.
    if (result?.reason === "busy") return;
    onToast(
      BOARD_TEXTS.failureToast(
        pickupNumber,
        result && "message" in result ? result.message : ORDER_MESSAGES.failed,
      ),
    );
    if (result?.reason === "rejected") onClose("rejected");
  }

  const radio = "flex min-h-14 items-center gap-3 rounded-lg px-2 text-xl";
  return (
    // 바깥 영역을 눌러도 닫지 않는다: 잘못 닫아 메뉴 · 사유를 다시 고르는 일을 막는다 (취소 팝업과 같음).
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // 메뉴가 많으면 1024 × 768 화면을 넘으므로 가운데만 스크롤하고 버튼은 늘 보이게 한다.
        className="flex max-h-[calc(100vh-2rem)] w-[36rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl bg-white p-8 shadow-xl"
      >
        <h2 id={titleId} className="text-2xl font-bold text-gray-900">
          {REMAKE_TEXTS.title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mt-3 text-lg text-gray-600">{REMAKE_TEXTS.menuGuide}</p>
          <ul
            aria-label={REMAKE_TEXTS.menuGuide}
            className="mt-1 divide-y divide-gray-100"
          >
            {items.map((item, i) => {
              const quantity = picked[i];
              const on = quantity !== undefined;
              const describedBy =
                item.options && item.options.length > 0
                  ? `${titleId}-options-${i}`
                  : undefined;
              const set = (next: number | undefined) =>
                setPicked((prev) => {
                  const copy = { ...prev };
                  if (next === undefined) delete copy[i];
                  else copy[i] = next;
                  return copy;
                });
              const step =
                "size-14 rounded-lg border border-gray-300 text-2xl font-bold disabled:opacity-40";
              return (
                <li key={i} className="flex items-center gap-3 py-2">
                  <label className="flex min-h-14 flex-1 items-center gap-3 text-xl">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={busy}
                      // 체크하면 주문 수량으로 시작한다.
                      onChange={() => set(on ? undefined : item.quantity)}
                      className="size-6 shrink-0"
                    />
                    <span className="min-w-0 break-words">
                      {item.name}
                      {item.options && item.options.length > 0 && (
                        <span
                          id={`${titleId}-options-${i}`}
                          className="block text-base text-gray-600"
                        >
                          {item.options.join(", ")}
                        </span>
                      )}
                      <span className="block text-base text-gray-500">
                        {REMAKE_TEXTS.ordered(item.quantity)}
                      </span>
                    </span>
                  </label>
                  {on && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        aria-label={REMAKE_TEXTS.decrease(item.name)}
                        // 같은 이름 메뉴(옵션만 다름)를 화면 낭독기에서 구분하게 옵션을 덧붙여 읽힌다.
                        aria-describedby={describedBy}
                        disabled={busy || quantity <= 1}
                        onClick={() => set(quantity - 1)}
                        className={step}
                      >
                        −
                      </button>
                      {/* output은 바뀐 값을 화면 낭독기가 알린다 (span의 aria-label은 잘 읽히지 않는다). */}
                      <output
                        aria-label={REMAKE_TEXTS.quantity(item.name)}
                        aria-live="polite"
                        className="w-8 text-center text-xl font-bold"
                      >
                        {quantity}
                      </output>
                      <button
                        type="button"
                        aria-label={REMAKE_TEXTS.increase(item.name)}
                        aria-describedby={describedBy}
                        disabled={busy || quantity >= item.quantity}
                        onClick={() => set(quantity + 1)}
                        className={step}
                      >
                        +
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div
            role="radiogroup"
            aria-label={REMAKE_TEXTS.guide}
            className="mt-3"
          >
            {REMAKE_TEXTS.reasons.map((r, i) => (
              <label key={r.label} className={radio}>
                <input
                  type="radio"
                  name="remake-reason"
                  checked={selected === i}
                  disabled={busy}
                  onChange={() => setSelected(i)}
                  className="size-6"
                />
                {r.label}
              </label>
            ))}
          </div>
          <ReasonTextInput
            label={REMAKE_TEXTS.customLabel}
            value={custom}
            disabled={!(choice && "custom" in choice) || busy}
            onChange={setCustom}
          />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <button
            ref={backRef}
            type="button"
            disabled={busy}
            onClick={() => onClose("back")}
            className="h-16 rounded-xl border border-gray-300 bg-white text-xl text-gray-700 disabled:opacity-50"
          >
            {REMAKE_TEXTS.back}
          </button>
          <button
            type="button"
            disabled={!text || pickedItems.length === 0 || busy}
            onClick={submit}
            className="h-16 rounded-xl bg-blue-600 text-xl font-bold text-white disabled:opacity-50"
          >
            {busy ? REMAKE_TEXTS.busy : REMAKE_TEXTS.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
