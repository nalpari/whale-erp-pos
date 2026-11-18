// 확인 팝업. 토글 OFF · 다시시작 · 로그아웃 · 프로그램 종료가 함께 쓴다 (화면정의서 p.5~6 모양).
import { useEffect, useId, useRef } from "react";

interface Props {
  title: string;
  message: string;
  /** 본문 아래에 굵게 더하는 경고 한 줄 (처리할 주문이 있을 때). */
  warning?: string | null;
  confirmLabel: string;
  cancelLabel?: string;
  /** 확인을 누른 뒤 처리 중이면 두 버튼을 모두 잠근다. */
  pending?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

export function ConfirmDialog({
  title,
  message,
  warning,
  confirmLabel,
  cancelLabel = "취소",
  pending = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId();
  const messageId = useId();
  const warningId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // 실수로 Enter를 눌러 주문 중단 · 로그아웃 · 종료가 실행되지 않게, 처음 초점은 [취소]에 둔다.
  // 닫히면 팝업을 열기 전 초점 자리로 돌려놓는다.
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={warning ? `${messageId} ${warningId}` : messageId}
        className="w-[28rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-8 shadow-xl"
      >
        <h2 id={titleId} className="text-2xl font-bold text-gray-900">
          {title}
        </h2>
        <p id={messageId} className="mt-3 text-lg text-gray-600">
          {message}
        </p>
        {warning && (
          <p id={warningId} className="mt-3 text-lg font-bold text-red-600">
            {warning}
          </p>
        )}
        <div className="mt-8 grid grid-cols-2 gap-4">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="h-16 rounded-xl border border-gray-300 bg-white text-xl text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-16 rounded-xl bg-red-600 text-xl font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
