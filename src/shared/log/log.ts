// 화면 로그를 Tauri 로그 플러그인(PC 파일)으로 보낸다. 브라우저(pnpm dev) · 테스트처럼
// Tauri가 없는 곳에서는 전송이 실패하므로 조용히 버린다. 여기서 console을 다시 부르면
// 브리지가 자기 자신을 부르는 무한 반복이 되기 때문이다.
import { isTauri } from "@tauri-apps/api/core";
import { error, info, warn } from "@tauri-apps/plugin-log";
import { errorSummary } from "../error-summary";
import { describeThrown, formatConsoleArgs } from "./log-messages";

// 브리지가 덮어쓰기 전의 console.error. 전송 장애를 알릴 때 쓰면 반복이 생기지 않는다.
let rawConsoleError: typeof console.error = (...args) => console.error(...args);
let sendFailure: { name: string; message: string } | null = null;

/** 실제 앱에서 로그 전송이 실패한 적이 있으면 그 요약 (권한 · 플러그인 등록 누락 등). 없으면 null. */
export function getLogSendFailure() {
  return sendFailure;
}

function send(
  fn: (message: string) => Promise<void>,
  message: string,
): Promise<void> {
  return fn(message).catch((e: unknown) => {
    // 브라우저 · 테스트는 Tauri가 없어 늘 실패하니 버린다. 실제 앱의 실패는 한 번 알린다.
    // 안 그러면 "기록이 한 줄도 안 남는" 장애가 "아직 기록 없음"처럼 보인다.
    if (!isTauri() || sendFailure) return;
    sendFailure = errorSummary(e);
    rawConsoleError("[log] 로그 전송 실패", sendFailure);
  });
}

/** 주요 사건(info)을 남긴다. 문장은 `logMessages`로만 만든다. 돌려주는 Promise는 거절하지 않는다. */
export function logInfo(message: string): Promise<void> {
  return send(info, message);
}

/**
 * 잡히지 않은 오류(렌더 중 오류 등)와 처리 안 된 Promise 거절을 로그로 보낸다. console.error를 거치지 않아
 * 브리지만으로는 못 잡는다. 오류는 이름과 문구만 남기고 요청 본문 등은 남기지 않는다. 해제 함수를 돌려준다.
 */
export function installGlobalErrorLogging(): () => void {
  const onError = (event: ErrorEvent) => {
    const where = event.filename ? ` (${event.lineno}:${event.colno})` : "";
    void send(
      error,
      `[uncaught] ${describeThrown(event.error ?? event.message)}${where}`,
    );
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    void send(error, `[unhandled-rejection] ${describeThrown(event.reason)}`);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** console.warn · error를 원래 동작은 그대로 두고 로그 파일로도 보낸다. 해제 함수를 돌려준다. */
export function installConsoleBridge(): () => void {
  const origWarn = console.warn;
  const origError = console.error;
  const prevRaw = rawConsoleError;
  rawConsoleError = origError;
  // 로그를 만들다 예외가 나도 원래 console 호출(이미 끝남)과 호출한 쪽의 흐름은 깨지 않는다.
  console.warn = (...args: unknown[]) => {
    origWarn.apply(console, args);
    try {
      void send(warn, formatConsoleArgs(args));
    } catch {
      /* 로그 실패는 무시 */
    }
  };
  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    try {
      void send(error, formatConsoleArgs(args));
    } catch {
      /* 로그 실패는 무시 */
    }
  };
  return () => {
    console.warn = origWarn;
    console.error = origError;
    rawConsoleError = prevRaw;
  };
}
