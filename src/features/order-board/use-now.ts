import { useEffect, useState } from "react";

/** 일정 간격마다 현재 시각을 새로 읽는다. 이것을 쓰는 작은 컴포넌트만 다시 그려진다 (스펙 2.4). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    // 켠 시각이 아니라 간격 경계(1분이면 매분 0초)에 바꾼다: 시계가 15:48이 되는 순간 「1분 지남」이 보이게 (12장 A-1).
    // setInterval 대신 매번 다음 경계를 다시 재서 건다: 절전에서 깨거나 시계가 바뀌어 박자가 밀려도 다음 번에 다시 맞는다.
    // 그린 때와 effect 사이에 경계를 넘었으면 지난 분에 머물지 않게 다시 읽는다. 같은 간격 안이면 이전 값을 둬 다시 그리지 않는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 경계를 넘었을 때만 바뀌는 한 번의 보정이라 연쇄 렌더가 없다
    setNow((prev) => {
      const t = Date.now();
      return Math.floor(t / intervalMs) === Math.floor(prev / intervalMs)
        ? prev
        : t;
    });
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
