// 로그에 남기는 문장을 만드는 곳. 개인정보(비밀번호 · 토큰 · 점포코드 · 웨일ERP 아이디 · PC 이름)가
// 문장에 섞이지 않도록, 인자는 정해진 종류만 받고 표에 없는 값은 "알 수 없음"으로 바꾼다 (SPEC-logging 2.4).
import type { AccountType } from "../api/auth";
import { errorSummary } from "../error-summary";

export type LoginFailReason =
  | "invalid-credentials"
  | "not-subscribed"
  | "store-not-managed"
  | "password-not-set"
  | "locked"
  | "network";
export type AutoLoginResult =
  "success" | "expired-token-cleared" | "network-token-kept";

const ACCOUNT: Record<AccountType, string> = {
  store: "점포번호 계정",
  master: "웨일ERP 계정",
};
const FAIL_REASON: Record<LoginFailReason, string> = {
  "invalid-credentials": "아이디 · 비밀번호 틀림",
  "not-subscribed": "미구독 점포",
  "store-not-managed": "관리할 수 없는 점포",
  "password-not-set": "매장 프로그램 비밀번호 미설정",
  locked: "로그인 잠김",
  network: "네트워크 등 오류",
};
const AUTO_LOGIN: Record<AutoLoginResult, string> = {
  success: "성공",
  "expired-token-cleared": "토큰 만료로 삭제",
  "network-token-kept": "네트워크 · 저장소 오류로 토큰 유지",
};

// 표에 없는 키는 값을 찍지 않고 고정 문구로 둔다.
function pick<K extends string>(table: Record<K, string>, key: K): string {
  return Object.prototype.hasOwnProperty.call(table, key)
    ? table[key]
    : "알 수 없음";
}

const WIDGET_STEP = {
  publish: "화면 보내기",
  "bring-front": "본 창 앞으로 가져오기",
  listen: "위젯 동작 받기",
  present: "창 띄우기 · 크기 맞추기",
  send: "위젯 동작 보내기",
  view: "화면 받기",
} as const;

export type OrderLogAction =
  "accept" | "cancel" | "complete" | "pickup" | "undo-pickup";
export type OrderLogResult =
  "success" | "already-handled" | "customer-cancelled" | "failed" | "timeout";
/** 서버 요청 종류. 실패 로그에서 어느 요청이었는지만 남긴다. */
export type SyncRequestKind =
  "connect" | "fetch" | "heartbeat" | "ack" | "accepting" | "confirm";

const ORDER_ACTION: Record<OrderLogAction, string> = {
  accept: "접수",
  cancel: "주문취소",
  complete: "제조완료",
  pickup: "픽업완료",
  "undo-pickup": "완료 취소",
};
const ORDER_RESULT: Record<OrderLogResult, string> = {
  success: "성공",
  "already-handled": "다른 PC가 먼저 처리",
  "customer-cancelled": "고객이 먼저 취소",
  failed: "실패",
  timeout: "시간 초과",
};
const SYNC_REQUEST: Record<SyncRequestKind, string> = {
  connect: "실시간 연결",
  fetch: "주문 조회",
  heartbeat: "연결 신호",
  ack: "수신 확인",
  confirm: "접수 결과 확인",
  accepting: "주문받기 상태",
};

export const logMessages = {
  appStarted: (version: string) => `앱 시작: ${version}`,
  appExited: () => "앱 종료",
  appRestarting: () => "앱 다시시작",
  loginSucceeded: (account: AccountType) =>
    `로그인 성공: ${pick(ACCOUNT, account)}`,
  loginFailed: (account: AccountType, reason: LoginFailReason) =>
    `로그인 실패: ${pick(ACCOUNT, account)}, ${pick(FAIL_REASON, reason)}`,
  loggedOut: () => "로그아웃",
  autoLoginResumed: (result: AutoLoginResult) =>
    `자동 로그인 재개: ${pick(AUTO_LOGIN, result)}`,
  orderAcceptRequested: (accepting: boolean, ok: boolean) =>
    `주문받기 ${accepting ? "ON" : "OFF"} 요청: ${ok ? "성공" : "실패"}`,
  // 프린터 이름은 개인정보가 아니라 남긴다 (스펙 2.3).
  testPrint: (printerName: string, ok: boolean) =>
    `시험 인쇄: ${printerName}, ${ok ? "성공" : "실패"}`,
  ordersStarted: () => "주문 수신 시작",
  ordersStopped: () => "주문 수신 멈춤",
  connectionLost: () => "서버 연결 끊김",
  connectionRestored: (seconds: number) =>
    `서버 다시 연결됨: ${Math.round(seconds)}초 만에`,
  // 주문은 orderId로만 남긴다 (개인정보 규칙).
  orderStatusChanged: (
    orderId: string,
    action: OrderLogAction,
    result: OrderLogResult,
  ) =>
    `주문 상태 변경: ${orderId}, ${pick(ORDER_ACTION, action)}, ${pick(ORDER_RESULT, result)}`,
  syncRequestFailed: (kind: SyncRequestKind, timedOut: boolean) =>
    `${pick(SYNC_REQUEST, kind)} 요청 ${timedOut ? "시간 초과" : "실패"}`,
  listenerFailed: (orderId: string) => `주문 신호 처리 중 오류: ${orderId}`,
  soundFailed: (kind: "new-order" | "warning") =>
    `${kind === "new-order" ? "새 주문" : "경고"} 알림음 재생 실패`,
  // 위젯 실패는 어느 단계인지만 남긴다 (원인 본문 · 주문 내용은 남기지 않는다).
  widgetFailed: (
    step: "publish" | "bring-front" | "listen" | "present" | "send" | "view",
  ) => `바탕화면 주문 알림 위젯 실패: ${WIDGET_STEP[step]}`,
  soundLimiterFailed: () => "알림음 리미터 만들기 실패(리미터 없이 재생)",
  ordersClearedIgnored: () =>
    "개발용 주문 전체 삭제 신호를 운영 빌드에서 받아 무시함",
  soundBlocked: () => "알림음이 막혀 있음(화면을 누르기 전일 수 있음)",
  duplicatesDropped: (count: number) =>
    `중복 · 오래된 주문 사건 ${count}건 버림`,
  // 검색어 · 고객 정보 · 결제 정보는 남기지 않는다 (주문내역 SPEC 6장).
  historyRequestFailed: (
    kind: "list" | "detail",
    timedOut: boolean,
    errorName: string,
    orderId?: string,
  ) =>
    `주문내역 ${kind === "list" ? "목록" : "상세"} 조회 ${timedOut ? "시간 초과" : `실패: ${errorName}`}${orderId ? ` (${orderId})` : ""}`,
  settingsFailed: (action: "save" | "load") =>
    action === "save" ? "설정 저장 실패" : "설정 읽기 실패",
  // 소개 · 공지 본문은 남기지 않는다 (매장정보 SPEC 7장).
  storeInfoSaved: () => "매장정보 저장",
  storeInfoFailed: (
    action: "load" | "save",
    timedOut: boolean,
    errorName: string,
  ) =>
    `매장정보 ${action === "load" ? "읽기" : "저장"} ${timedOut ? "시간 초과" : `실패: ${errorName}`}`,
};

/**
 * console.warn · error 인자를 한 줄 문장으로 바꾼다.
 * Error는 이름과 문구만 남긴다. 요청 본문(휴대폰 번호 등)이 붙어 있을 수 있기 때문이다.
 */
export function formatConsoleArgs(args: unknown[]): string {
  const text = args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) {
        const { name, message } = errorSummary(arg);
        return `${name}: ${message}`;
      }
      try {
        return JSON.stringify(sanitize(arg, 0)) ?? String(arg);
      } catch {
        return "[변환 불가]";
      }
    })
    .join(" ");
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}

/**
 * 잡히지 않고 던져진 값(전역 오류 · Promise 거절)을 한 줄로 요약한다. Error는 이름과 문구,
 * 문자열은 그대로, 그 밖의 값(HTTP 응답 객체 등)은 요청 본문이 들어 있을 수 있어 종류만 남긴다.
 */
export function describeThrown(value: unknown): string {
  if (value instanceof Error) {
    const { name, message } = errorSummary(value);
    return `${name}: ${message}`;
  }
  if (typeof value === "string") return value;
  return `[${value === null ? "null" : typeof value}]`;
}

// 한 줄이 너무 길면 로그 파일과 로그 확인 화면이 느려진다.
const MAX_LENGTH = 2000;
const MAX_DEPTH = 3;

/**
 * 객체 안에 든 Error도 이름과 문구만 남긴다. 오류에 붙은 요청 본문(휴대폰 번호 · 토큰)이
 * 객체로 감싸 넘겨도 JSON에 섞이지 않게 한다. 너무 깊은 곳은 자리표시로 둔다.
 */
function sanitize(value: unknown, depth: number): unknown {
  if (value instanceof Error) return errorSummary(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth >= MAX_DEPTH) return "[생략]";
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, sanitize(v, depth + 1)]),
  );
}
