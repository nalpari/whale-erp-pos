import { useEffect, useState } from "react";

/** 일정 간격마다 현재 시각을 새로 읽는다. 이것을 쓰는 작은 컴포넌트만 다시 그려진다 (스펙 2.4). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // 켠 시각이 아니라 간격 경계(1분이면 매분 0초)에 바꾼다: 시계가 15:48이 되는 순간 「1분 지남」이 보이게 (12장 A-1).
    // setInterval 대신 매번 다음 경계를 다시 재서 건다: 절전에서 깨거나 시계가 바뀌어 박자가 밀려도 다음 번에 다시 맞는다.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        intervalMs - (Date.now() % intervalMs),
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [intervalMs]);
  return now;
}
