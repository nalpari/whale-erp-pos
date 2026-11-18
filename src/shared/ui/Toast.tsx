// 저장 성공 같은 짧은 알림 (기획자 Q45 ③, Q42). 화면 아래 가운데에 2초 보였다가 저절로 사라진다.
// 닫기 버튼은 없다. 같은 알림을 다시 띄우려면 부모가 key를 바꿔 새로 그려 시간을 다시 잰다.
import { useEffect, useRef } from "react";

export const TOAST_DURATION_MS = 2000;

interface Props {
  message: string;
  onClose(): void;
}

export function Toast({ message, onClose }: Props) {
  // 부모가 렌더마다 새 onClose를 넘겨도 2초가 다시 시작되지 않게, 최신 값만 ref에 담아 둔다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center">
      <p
        role="status"
        className="rounded-full bg-gray-900/90 px-8 py-4 text-xl text-white"
      >
        {message}
      </p>
    </div>
  );
}
