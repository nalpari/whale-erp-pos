// 사유 직접 입력 칸 (취소 · 재제조 팝업 공용). 50자 · 줄바꿈 없음 (Q40).
import { useRef, useState } from "react";
import { CANCEL_REASON_MAX, clampReason, countChars } from "./summary-logic";
import { CANCEL_TEXTS } from "./summary-texts";

interface Props {
  label: string;
  value: string;
  disabled: boolean;
  onChange(text: string): void;
  /** 글자 수 앞에 붙는 안내 (예: 「입력한 사유는 고객에게 보입니다.」). */
  notice?: string;
}

export function ReasonTextInput({
  label,
  value,
  disabled,
  onChange,
  notice,
}: Props) {
  const [tooLong, setTooLong] = useState(false);
  // 한글 조합 중에 값을 잘라 넣으면 글자가 깨지므로, 조합이 끝난 뒤에 자른다.
  const composing = useRef(false);
  function apply(raw: string) {
    const next = clampReason(raw);
    onChange(next.text);
    setTooLong(next.truncated);
  }
  return (
    <>
      <input
        type="text"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          // maxLength 대신 직접 자른다: 이모지 · 합친 글자를 1자로 세는 기준(Q40)이 브라우저 기본과 다르다.
          if (composing.current) onChange(e.target.value);
          else apply(e.target.value);
        }}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          apply(e.currentTarget.value);
        }}
        className="mt-2 min-h-14 w-full rounded-lg border border-gray-300 px-3 text-xl disabled:bg-gray-100"
      />
      <p className="mt-1 text-base text-gray-600">
        {notice && `${notice} `}
        <span aria-hidden="true">
          ({countChars(value)}/{CANCEL_REASON_MAX})
        </span>
      </p>
      {tooLong && (
        <p role="status" className="text-base font-bold text-red-600">
          {CANCEL_TEXTS.tooLong}
        </p>
      )}
    </>
  );
}
