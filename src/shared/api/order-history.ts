// 주문내역 조회 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (SPEC-order-history 4장, 가정).
// 아래 요청 · 응답 형태와 칸 이름은 모두 가정이다. 백엔드 요청 문서 3.7 · 7장과 맞추고, 협의 뒤 이 파일만 바꾼다.
// 걸러 세는 일은 서버가 한다고 가정하므로, 모의 구현이 그 일을 흉내 낸다. 화면은 직접 세지 않는다.
import { addDays, sameDayLastMonth, startOfDay } from "../date-days";
import {
  isCancelledStatus,
  type Order,
  type OrderStatus,
  type RemakeFault,
  type RemakeItem,
} from "./orders";

export type HistoryTab =
  "all" | "pending" | "preparing" | "ready" | "picked-up" | "cancelled"; // 매장취소 + 고객취소 + 환불 (Q17 · Q19 · T22)

export const PAGE_SIZES = [20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export interface HistoryQuery {
  /** 조회 기간. 두 값 모두 그날 0시(ms)이고, 끝 날짜는 그날 전체를 포함한다. 검색어가 있으면 서버가 무시한다. */
  fromDay: number;
  toDay: number;
  tab: HistoryTab;
  /** 휴대폰 끝 4자리 · 픽업번호 · 주문번호. 빈 값이면 검색 없음. 서버가 최근 한 달 전체에서 찾는다 (Q36). */
  q: string;
  /** 1부터. */
  page: number;
  size: PageSize;
}

export interface HistoryRow {
  orderId: string;
  pickupNumber: number;
  status: OrderStatus;
  /** 서버가 가린 값. */
  customerName: string;
  /** 주문한 메뉴 이름(종류마다 하나). 「외 N개」는 화면이 만든다. */
  menuNames: string[];
  /** 결제금액(할인 뒤, Q35). */
  paidAmount: number;
  paidAt: number;
}

export interface HistorySummary {
  /** 탭의 결제 합계. 전체 · 그 밖의 탭은 취소를 뺀 결제금액, 취소 탭은 취소 금액이다 (Q35). */
  amount: number;
  /** 전체 탭에서 합계에서 뺀 취소 건수. 다른 탭은 0. */
  excludedCancelCount: number;
}

export interface HistoryPage {
  rows: HistoryRow[];
  /** 기간 · 검색 조건에 맞는 주문의 탭별 건수. */
  counts: Record<HistoryTab, number>;
  summary: HistorySummary;
}

export interface HistoryItem {
  name: string;
  quantity: number;
  unitPrice: number;
  options: { name: string; price: number }[];
}

export type DiscountKind = "promotion" | "coupon" | "stamp" | "point";

/**
 * 카드 결제 정보 (영수증 Q50, T12 스펙 6장 가정). 카드번호는 서버가 가려서 준다(앱이 원번호를 받지 않음).
 * 칸 이름과 값 형태는 모두 가정이고, 백엔드 요청 문서 7.2 #4에 덧붙였다.
 */
export interface CardInfo {
  maskedNumber: string;
  kind: "신용" | "체크";
  /** 일시불 · 할부 N개월. */
  division: string;
  acquirer: string;
}

export interface Payment {
  orderAmount: number;
  /** 쓴 것만 온다 (Q35). */
  discounts: { kind: DiscountKind; amount: number }[];
  paidAmount: number;
  /** 카드 · 간편결제(예: 카카오페이) · 포인트 결제 등 표시용 이름. */
  method: string;
  /** 과세금액 · 부가세는 서버 값을 그대로 찍는다(앱이 계산하지 않음, T12 스펙 4.2). 가정. */
  taxableAmount: number;
  vat: number;
  /** 카드 · 간편결제의 승인 정보. 전액 할인(결제금액 0원)이면 null. 가정. */
  approvalNumber: string | null;
  /** 영수증에 찍는 승인일시(서버 값 그대로). 주문의 결제 시각은 `Order.paidAt` 하나만 쓴다(기획 결정). */
  approvedAt: number | null;
  /** 카드 결제일 때만. 간편결제 · 전액 할인은 null. 가정. */
  card: CardInfo | null;
  transactionId: string;
}

export interface CancelInfo {
  at: number;
  by: "store" | "customer" | "auto";
  reason: string | null;
  /** 환불이 끝난 시각. 상태가 「환불」일 때만 있다 (T22, 칸 이름은 가정 · 백엔드 협의). */
  refundedAt?: number;
}

/** 재제조 한 번 (SPEC-remake 7장, 가정). 같은 주문에 여러 번 쌓인다. */
export interface RemakeRecord {
  at: number;
  /** 다시 만든 메뉴 줄과 수량. */
  items: RemakeItem[];
  reason: string;
  fault: RemakeFault;
}

export interface HistoryOrder extends Omit<Order, "items"> {
  items: HistoryItem[];
  payment: Payment;
  cancel: CancelInfo | null;
  /** 오래된 것이 앞. 없으면 빈 배열. */
  remakes: RemakeRecord[];
  /** 이 고객이 이 점포에서 결제한 누적 주문 수(이번 주문 포함, 취소 · 환불 제외, Q29 · T22). 1이면 첫 주문. */
  orderCount: number;
}

/** 영수증 머리에 찍는 점포 정보 (T12 스펙 6장, 새 조회 하나로 가정). */
export interface ReceiptStore {
  name: string;
  phone: string;
  address: string;
  representative: string;
  businessNumber: string;
}

export interface OrderHistoryApi {
  fetchPage(query: HistoryQuery): Promise<HistoryPage>;
  fetchDetail(orderId: string): Promise<HistoryOrder>;
  /** 영수증용 점포 정보. 실패하면 reject한다. */
  fetchReceiptStore(): Promise<ReceiptStore>;
}

const TABS: HistoryTab[] = [
  "all",
  "pending",
  "preparing",
  "ready",
  "picked-up",
  "cancelled",
];

function tabOf(status: OrderStatus): HistoryTab {
  return isCancelledStatus(status) ? "cancelled" : status;
}

/** 서버가 하는 검색을 흉내 낸다: 16자리는 주문번호, 그 밖의 숫자는 픽업번호 또는 휴대폰 끝 4자리. */
function matchesSearch(order: HistoryOrder, q: string): boolean {
  const digits = q.replace(/\D/g, "");
  if (digits === "" || digits !== q.replace(/^#/, "")) return false;
  if (digits.length === 16) return order.orderNumber === digits;
  return (
    order.pickupNumber === Number(digits) ||
    (digits.length === 4 && order.phoneLast4 === digits)
  );
}

// 시험용 메뉴와 값. 실제 메뉴 · 고객 정보가 아니다.
const MENUS = [
  { name: "아이스 아메리카노(시험)", price: 4500 },
  { name: "카페라떼(시험)", price: 5000 },
  { name: "딸기 스무디(시험)", price: 6500 },
  { name: "치즈 케이크(시험)", price: 6000 },
  { name: "초코 쿠키(시험)", price: 3000 },
];
const OPTION_PRICES: Record<string, number> = { "샷 추가": 500 };
// 시험용 결제 수단. 전액 할인은 seed % 6 === 5인 주문이다(결제수단 이름은 「포인트 결제」, 할인 종류는 포인트 또는 쿠폰). 영수증 양식 4종(신용 · 체크 · 간편결제 · 전액 할인)을 모두 볼 수 있게 한다.
const METHODS = ["신용카드", "카카오페이", "체크카드"];
const CANCEL_REASONS = [
  "재료가 소진되었습니다",
  "주문이 많아 준비가 어렵습니다",
  "매장 사정으로 주문을 취소합니다",
];
const DISCOUNT_KINDS: DiscountKind[] = [
  "promotion",
  "coupon",
  "stamp",
  "point",
];

/** 오늘 주문(T03 모의 주문)에 결제 정보를 붙인다. 값은 주문에서 정해지는 시험용 값이다. */
export function toHistoryOrder(
  order: Order,
  cancel: CancelInfo | null,
  remakes: RemakeRecord[],
): HistoryOrder {
  const items: HistoryItem[] = order.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: MENUS.find((m) => m.name === item.name)?.price ?? MENUS[0].price,
    options: (item.options ?? []).map((name) => ({
      name,
      price: OPTION_PRICES[name] ?? 0,
    })),
  }));
  return withPayment({ ...order, items, remakes }, cancel, order.pickupNumber);
}

function withPayment(
  base: Omit<HistoryOrder, "payment" | "cancel" | "orderCount">,
  cancel: CancelInfo | null,
  seed: number,
): HistoryOrder {
  const orderAmount = base.items.reduce(
    (sum, i) =>
      sum +
      i.quantity * (i.unitPrice + i.options.reduce((s, o) => s + o.price, 0)),
    0,
  );
  const fullDiscount = seed % 6 === 5;
  const discountAmount = fullDiscount
    ? orderAmount
    : seed % 3 === 0
      ? Math.min(1000, orderAmount)
      : 0;
  const discounts =
    discountAmount > 0
      ? [
          {
            kind: fullDiscount
              ? seed % 4 === 1
                ? ("point" as const)
                : ("coupon" as const)
              : DISCOUNT_KINDS[seed % DISCOUNT_KINDS.length],
            amount: discountAmount,
          },
        ]
      : [];
  const paidAmount = orderAmount - discountAmount;
  // 부가세는 서버가 계산해 준다고 가정한다: 결제금액에 포함된 10%를 모의로 흉내 낸다.
  const vat = Math.floor(paidAmount / 11);
  const method = fullDiscount ? "포인트 결제" : METHODS[seed % METHODS.length];
  const isCard = method === "신용카드" || method === "체크카드";
  return {
    ...base,
    cancel,
    orderCount: 1, // 모의 서버(createMockOrderHistoryApi)가 조회 때 센다
    payment: {
      orderAmount,
      discounts,
      paidAmount,
      method,
      taxableAmount: paidAmount - vat,
      vat,
      approvalNumber: paidAmount > 0 ? String(30000000 + seed * 7919) : null,
      approvedAt: paidAmount > 0 ? base.paidAt : null,
      card: isCard
        ? {
            maskedNumber: `${4000 + (seed % 1000)}-12**-****-${1000 + ((seed * 37) % 9000)}`,
            kind: method === "신용카드" ? "신용" : "체크",
            division: seed % 8 === 0 ? "할부 3개월" : "일시불",
            acquirer: seed % 8 === 0 ? "시험카드" : "시험은행",
          }
        : null,
      transactionId: `TX${base.orderNumber}`,
    },
  };
}

/** 최근 한 달 예시 주문 (오늘 제외). 날짜가 같으면 항상 같은 값이 나온다. */
function pastOrders(today: number): HistoryOrder[] {
  const result: HistoryOrder[] = [];
  const first = sameDayLastMonth(today);
  for (let day = first, n = 0; day < today; day = addDays(day, 1), n += 1) {
    const d = new Date(day);
    const yymmdd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const count = 3 + (n % 4);
    for (let i = 0; i < count; i += 1) {
      const seed = n * 7 + i;
      const paidAt = day + (9 * 60 + i * 37) * 60_000;
      // 열 번에 한 번은 매장취소, 열 번 중 한 번은 고객취소. 그중 절반은 환불까지 끝났다 (T22).
      // 모의 데이터는 단순하게 지난 날을 픽업완료 · 취소 · 환불만 만든다(실제로는 0시 자동 픽업완료가 없어 제조중 · 제조완료가 남을 수 있다).
      const cancelBy =
        seed % 10 === 3 ? "store" : seed % 10 === 7 ? "customer" : null;
      const refunded = cancelBy !== null && seed % 20 >= 10;
      const status: OrderStatus = refunded
        ? "refunded"
        : cancelBy === "store"
          ? "store-cancelled"
          : cancelBy === "customer"
            ? "customer-cancelled"
            : "picked-up";
      const cancelled = cancelBy !== null;
      const menus = MENUS.slice(seed % 3, (seed % 3) + 1 + (seed % 4));
      result.push(
        withPayment(
          {
            orderId: `hist-${n}-${i}`,
            // 일련번호는 1001부터: 오늘 모의 주문(0001부터)과 번호가 겹치지 않게 한다.
            orderNumber: `${yymmdd}000001${String(1001 + i)}`,
            pickupNumber: i + 1,
            status,
            // 환불이 마지막 변경이다 (아래 refundedAt과 같게)
            updatedAt: paidAt + (refunded ? 60 : 15) * 60_000,
            paidAt,
            // 지난 주문의 자동 취소 시각은 모의 값이라 기본 15분으로 둔다 (주문내역은 이 값을 쓰지 않는다).
            autoCancelAt: paidAt + 15 * 60_000,
            pickupChoice: "20min",
            remakes: [],
            items: menus.map((m, k) => ({
              name: m.name,
              quantity: 1 + ((seed + k) % 2),
              unitPrice: m.price,
              options:
                k === 0 && seed % 2 === 0
                  ? [{ name: "샷 추가", price: OPTION_PRICES["샷 추가"] }]
                  : [],
            })),
            note: seed % 5 === 0 ? "빨대는 필요 없습니다." : undefined,
            customerName: "홍*동",
            phoneLast4: String(1000 + ((seed * 37) % 9000)),
            statusTimes: {
              preparingAt: cancelled ? null : paidAt + 2 * 60_000,
              readyAt: cancelled ? null : paidAt + 8 * 60_000,
              pickedUpAt: cancelled ? null : paidAt + 15 * 60_000,
            },
          },
          cancelBy
            ? {
                at: paidAt + 5 * 60_000,
                by: cancelBy,
                reason:
                  cancelBy === "store"
                    ? CANCEL_REASONS[seed % CANCEL_REASONS.length]
                    : null,
                ...(refunded && { refundedAt: paidAt + 60 * 60_000 }),
              }
            : null,
          seed,
        ),
      );
    }
  }
  return result;
}

export interface MockOrderHistoryOptions {
  /** 오늘 주문. 모의 주문 서버가 가진 것과 같은 주문이다 (취소된 것 포함). */
  todayOrders(): HistoryOrder[];
  /** 응답까지 걸리는 시간. 0이면 타이머 없이 바로 응답한다 (테스트). 기본 300ms. */
  delayMs?: number;
  now?(): number;
  /** 연결이 끊긴 모의 서버처럼 요청이 실패하게 한다. */
  isConnected?(): boolean;
}

export function createMockOrderHistoryApi(
  options: MockOrderHistoryOptions,
): OrderHistoryApi {
  const { delayMs = 300, now = Date.now, isConnected = () => true } = options;
  async function guard() {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (!isConnected()) throw new Error("모의 서버 연결 끊김");
  }
  const all = () => {
    const today = startOfDay(now());
    const orders = [...pastOrders(today), ...options.todayOrders()];
    // 서버가 하는 「N번째 주문」 셈을 흉내 낸다: 같은 고객(끝 4자리)의 앞선 주문 중 취소 · 환불을 뺀 수 + 이번 주문 (Q29 · HST-08).
    // shortcut: 모의 데이터(최근 한 달)만 센다. 실제 서버는 기간 제한 없이 센다.
    return orders.map((o) => ({
      ...o,
      orderCount:
        1 +
        orders.filter(
          (p) =>
            p.phoneLast4 === o.phoneLast4 &&
            p.paidAt < o.paidAt &&
            !isCancelledStatus(p.status),
        ).length,
    }));
  };

  return {
    async fetchPage(query) {
      await guard();
      const today = startOfDay(now());
      const searching = query.q !== "";
      // 검색은 고른 기간과 상관없이 최근 한 달 전체에서 찾는다 (Q36).
      const from = searching ? sameDayLastMonth(today) : query.fromDay;
      const to = searching ? today : query.toDay;
      const end = addDays(to, 1);
      const inScope = all()
        .filter((o) => o.paidAt >= from && o.paidAt < end)
        .filter((o) => !searching || matchesSearch(o, query.q))
        .sort((a, b) => b.paidAt - a.paidAt);
      const counts = Object.fromEntries(
        TABS.map((t) => [
          t,
          inScope.filter((o) => t === "all" || tabOf(o.status) === t).length,
        ]),
      ) as Record<HistoryTab, number>;
      const inTab = inScope.filter(
        (o) => query.tab === "all" || tabOf(o.status) === query.tab,
      );
      const isCancelled = (o: HistoryOrder) => isCancelledStatus(o.status);
      const summed =
        query.tab === "cancelled"
          ? inTab
          : inTab.filter((o) => !isCancelled(o));
      const start = (query.page - 1) * query.size;
      return {
        rows: inTab.slice(start, start + query.size).map((o) => ({
          orderId: o.orderId,
          pickupNumber: o.pickupNumber,
          status: o.status,
          customerName: o.customerName,
          menuNames: o.items.map((i) => i.name),
          paidAmount: o.payment.paidAmount,
          paidAt: o.paidAt,
        })),
        counts,
        summary: {
          amount: summed.reduce((s, o) => s + o.payment.paidAmount, 0),
          excludedCancelCount:
            query.tab === "all" ? inTab.filter(isCancelled).length : 0,
        },
      };
    },
    async fetchDetail(orderId) {
      await guard();
      const found = all().find((o) => o.orderId === orderId);
      if (!found) throw new Error("모의 서버: 없는 주문");
      return found;
    },
    async fetchReceiptStore() {
      await guard();
      // 시험용 값이다. 실제 점포 정보가 아니다.
      return {
        name: "웨일커피 시험점",
        phone: "02-000-0000",
        address: "서울특별시 시험구 시험로 1길 2",
        representative: "김시험",
        businessNumber: "000-00-00000",
      };
    },
  };
}
