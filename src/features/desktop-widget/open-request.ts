// 위젯에서 카드 · 「+ N건 더 있음」을 눌렀을 때 주문접수 화면이 받는 요청 (T06 스펙 3.4).
// 화면이 이미 떠 있든(요청이 바뀐다) 이제 열리든(처음부터 요청이 있다) 같은 길로 받는다.
import { createContext, useContext } from "react";

export interface OpenRequest {
  /** 같은 주문을 연달아 눌러도 새 요청으로 보이게 하는 번호. */
  seq: number;
  /** 있으면 그 주문의 요약 팝업을 연다. 없으면 [주문접수] 첫 탭만 연다. */
  orderId?: string;
}

export interface OpenRequestValue {
  request: OpenRequest | null;
  /** 화면이 요청을 처리했다. 다른 탭에 갔다 돌아올 때 같은 요청을 다시 처리하지 않게 지운다. */
  consume(seq: number): void;
}

export const OpenRequestContext = createContext<OpenRequestValue | null>(null);

/** 위젯이 없는 곳(테스트 등)에서는 null. */
export function useOpenRequest(): OpenRequestValue | null {
  return useContext(OpenRequestContext);
}
