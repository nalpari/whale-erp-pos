import { useEffect, useRef } from "react";

/** 요청이 끝나기 전에 화면이 사라졌는지(탭 전환 · 팝업 닫기) 알기 위해 쓴다. 늦게 온 응답은 버린다. */
export function useMountedRef() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
