// 출력 상태를 화면에 내려 주는 Context. Provider(PrintFormsProvider.tsx)와 파일을 나눠 두어야 화면 새로고침(fast refresh)이 된다.
import { createContext, useContext } from "react";
import type {
  HistoryOrder,
  ReceiptStore,
} from "../../shared/api/order-history";
import type { RemakeItem } from "../../shared/api/orders";
import type { PrintLine } from "../../shared/printer/print-lines";
import type { PaperWidth } from "../../shared/printer/printer-settings";
import type { OrderFormInput } from "./order-form";

/** 주문서 출력에 실패한 슬롯. reason은 Rust가 돌려준 고정 문구다. */
export interface FailedSlot {
  /** 0부터. 화면에는 +1을 슬롯 번호로 보인다. */
  index: number;
  printerName: string;
  reason: string;
  /** 30초 안에 끝나지 않아 결과를 모른다: 띠 문구가 「출력 결과를 확인할 수 없습니다.」가 된다. */
  unknownResult?: true;
}

/** 빨간 띠 하나(주문 하나). 출력 내용(lines)은 메모리에만 두고 [다시 인쇄]에 쓴다. */
export interface PrintFailure {
  orderId: string;
  pickupNumber: number;
  lines: PrintLine[];
  /** 알려진 실패 슬롯. 비어 있으면(설정을 처음부터 못 읽음) 다시 인쇄가 「주문서」 체크된 모든 슬롯에 낸다. */
  slots: FailedSlot[];
  /** 설정을 읽지 못해 출력하지 못했다(이유 문구). 있으면 띠에 같이 적는다. */
  extraReason?: string;
  /** [×]로 띠만 닫았다. 「미출력」 꼬리표는 다시 인쇄에 성공할 때까지 남는다 (스펙 5장). */
  bannerClosed?: true;
}

/** busy: 같은 주문을 이미 보내는 중이라 새로 내지 않았다. */
export type OrderPrintResult = "ok" | "no-printer" | "failed" | "busy";
export type ReceiptPrintResult = { ok: true } | { ok: false; message: string };

export interface PrintFormsValue {
  /** 실패 띠가 떠 있는 주문(닫지 않은 것, 오래된 것이 앞). 프로그램을 다시 켜면 사라진다 (11장 D). */
  failures: PrintFailure[];
  /** 「미출력」 꼬리표를 붙일 주문. */
  unprinted: ReadonlySet<string>;
  /** 출력을 보내는 중인 주문. 버튼을 막는 데 쓴다. */
  printing: Readonly<Record<string, true>>;
  /** 「영수증」 체크된 슬롯이 있는지. 마지막으로 읽은 값이다. */
  receiptEnabled: boolean;
  /** 영수증을 낼 슬롯(번호가 가장 앞선 한 대)의 용지 폭. 미리보기가 같은 폭으로 그린다. 없으면 80. */
  receiptPaperWidth: PaperWidth;
  /** 설정을 다시 읽어 receiptEnabled를 갱신한다. 인쇄 버튼이 있는 화면이 열릴 때 부른다. */
  refreshReceiptEnabled(): Promise<void>;
  /**
   * [주문서 인쇄]. 미출력 주문이면 실패한 슬롯에만 「[재출력]」 없이, 아니면 체크된 슬롯 모두에 「[재출력]」과 시각을 찍어 낸다.
   * 실패는 띠 · 꼬리표 · 경고음으로 알리므로 부르는 쪽은 no-printer일 때 토스트만 보이면 된다.
   */
  printOrder(
    order: OrderFormInput & { orderId: string },
  ): Promise<OrderPrintResult>;
  /**
   * [재제조]가 서버에서 성공했을 때 (T21). 「주문서」 체크된 슬롯 모두로 「[재제조]」 주문서를 낸다.
   * 실패 처리는 주문서와 같고, 다시 인쇄도 「[재제조]」 주문서다.
   */
  printRemake(
    order: OrderFormInput & { orderId: string },
    reason: string,
    /** 고른 메뉴 줄 · 수량. 이것만 찍는다. */
    items: RemakeItem[],
  ): Promise<OrderPrintResult>;
  /** 띠의 [다시 인쇄]: 실패한 슬롯에만 낸다. */
  retry(orderId: string): Promise<OrderPrintResult>;
  /** 띠의 [×]. 띠만 닫고 「미출력」 꼬리표는 남긴다. */
  dismiss(orderId: string): void;
  /** 미리보기의 [영수증 인쇄]: 「영수증」 체크된 슬롯 중 번호가 가장 앞선 한 대로. */
  printReceipt(
    order: HistoryOrder,
    store: ReceiptStore,
  ): Promise<ReceiptPrintResult>;
}

export const PrintFormsContext = createContext<PrintFormsValue | null>(null);

/** Provider 밖(출력이 없는 화면 · 일부 테스트)에서는 null: 인쇄 버튼은 막혀 있고 꼬리표 · 띠는 없다. */
export function usePrintForms(): PrintFormsValue | null {
  return useContext(PrintFormsContext);
}
