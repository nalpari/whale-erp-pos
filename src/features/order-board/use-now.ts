import { useEffect, useState } from "react";

/** 일정 간격마다 현재 시각을 새로 읽는다. 이것을 쓰는 작은 컴포넌트만 다시 그려진다 (스펙 2.4). */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
