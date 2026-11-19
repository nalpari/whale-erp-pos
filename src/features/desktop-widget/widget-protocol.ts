// 본 창과 위젯 창이 주고받는 메시지 (T06 스펙 4장). 주문 목록은 본 창 하나가 가지므로,
// 위젯은 본 창이 보낸 WidgetView를 그리기만 하고 누른 것은 WidgetCommand로 돌려보낸다.
import type { Order } from "../../shared/api/orders";

export const WIDGET_VIEW_EVENT = "widget:view";
export const WIDGET_COMMAND_EVENT = "widget:command";
/** tauri.conf.json에 미리 만들어 두는 위젯 창의 label. */
export const WIDGET_LABEL = "widget";

/** 위젯 카드에 필요한 값만 보낸다. 고객명 · 연락처는 위젯에 필요 없으므로 넘기지 않는다. */
export interface WidgetCardView {
  orderId: string;
  pickupNumber: number;
  /** picked-up은 [픽업완료] 직후 5초 동안 보이는 「완료 취소」 카드다. */
  status: "pending" | "preparing" | "ready" | "picked-up";
  paidAt: number;
  pickupChoice: Order["pickupChoice"];
  note?: string;
  items: Array<{ name: string; quantity: number }>;
  /** 이 주문의 요청이 진행 중이라 버튼을 막는다. */
  busy: boolean;
  /** 「#12 …」 실패 문구. 3초 보인다 (11장 F). */
  failure?: string;
  /** 「완료 취소」를 받는 마감 시각(ms). picked-up 카드에만 있다. */
  undoExpiresAt?: number;
}

export interface WidgetView {
  visible: boolean;
  /** 서버 자동 OFF 안내 카드 (Q54). 카드 장수 셈에 넣지 않는다. */
  autoOffCard: boolean;
  /** 본 창이 위젯의 동작을 못 받는다 (받기 등록이 계속 실패). 위젯이 「본 화면에서 처리해 주세요」를 보인다. */
  linkFailed?: boolean;
  cards: WidgetCardView[];
  /** 최대 장수(WIDGET_MAX_CARDS)를 넘어 보내지 않은 카드 수. 위젯 창은 높이 때문에 못 그린 카드를 여기에 더해 「+ N건 더 있음」으로 보인다. */
  moreCount: number;
}

export const HIDDEN_VIEW: WidgetView = {
  visible: false,
  autoOffCard: false,
  cards: [],
  moreCount: 0,
};

export type WidgetCommand =
  | {
      type: "action";
      orderId: string;
      action: "accept" | "complete" | "pickup" | "undo-pickup";
    }
  | { type: "cancel"; orderId: string }
  | { type: "open"; orderId: string }
  | { type: "more" }
  | { type: "close-card"; orderId: string }
  | { type: "close-all" }
  | { type: "auto-off-open" }
  | { type: "auto-off-close" }
  | { type: "ready" };
