import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

const plugin = vi.hoisted(() => ({
  warn: vi.fn<(message: string) => Promise<void>>(async () => {}),
  error: vi.fn<(message: string) => Promise<void>>(async () => {}),
  info: vi.fn<(message: string) => Promise<void>>(async () => {}),
}));
vi.mock("@tauri-apps/plugin-log", () => plugin);

import {
  installConsoleBridge,
  installGlobalErrorLogging,
  logInfo,
} from "./log";

describe("installConsoleBridge", () => {
  const origWarn = console.warn;
  const origError = console.error;
  let nativeWarn: Mock;
  let nativeError: Mock;
  let uninstall: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    nativeWarn = vi.fn();
    nativeError = vi.fn();
    console.warn = nativeWarn;
    console.error = nativeError;
    uninstall = installConsoleBridge();
  });
  afterEach(() => {
    uninstall();
    console.warn = origWarn;
    console.error = origError;
  });

  it("console.error · warn을 원래대로 찍고 로그 파일로도 보낸다", () => {
    console.error("[auth] 실패", new Error("x"));
    console.warn("주의");
    expect(nativeError).toHaveBeenCalledOnce();
    expect(plugin.error).toHaveBeenCalledWith("[auth] 실패 Error: x");
    expect(plugin.warn).toHaveBeenCalledWith("주의");
  });

  it("로그 전송이 실패해도 예외를 던지지 않고 console을 다시 부르지 않는다", async () => {
    plugin.error.mockRejectedValueOnce(new Error("no tauri"));
    expect(() => console.error("a")).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(nativeError).toHaveBeenCalledOnce();
  });

  it("해제하면 원래 함수로 돌아간다", () => {
    uninstall();
    console.error("b");
    expect(plugin.error).not.toHaveBeenCalled();
  });
});

describe("logInfo", () => {
  it("info로 보내고, 전송 실패는 삼킨다", async () => {
    plugin.info.mockRejectedValueOnce(new Error("no tauri"));
    expect(() => logInfo("앱 시작: 0.1.0")).not.toThrow();
    expect(plugin.info).toHaveBeenCalledWith("앱 시작: 0.1.0");
    await Promise.resolve();
  });
});

describe("installGlobalErrorLogging", () => {
  const swallow = (e: Event) => e.preventDefault();
  let off: () => void;
  beforeEach(() => {
    vi.clearAllMocks();
    // 테스트에서 일부러 낸 오류를 vitest가 "처리 안 된 오류"로 세지 않게 막는다.
    window.addEventListener("error", swallow);
    off = installGlobalErrorLogging();
  });
  afterEach(() => {
    off();
    window.removeEventListener("error", swallow);
  });

  function reject(reason: unknown) {
    const event = new Event("unhandledrejection");
    Object.assign(event, { reason });
    window.dispatchEvent(event);
  }

  it("잡히지 않은 오류와 Promise 거절을 이름 · 문구만 남긴다", () => {
    const err = Object.assign(new Error("렌더 실패"), {
      config: { data: "01012345678" },
    });
    window.dispatchEvent(new ErrorEvent("error", { error: err }));
    reject(err);

    expect(plugin.error).toHaveBeenCalledWith("[uncaught] Error: 렌더 실패");
    expect(plugin.error).toHaveBeenCalledWith(
      "[unhandled-rejection] Error: 렌더 실패",
    );
    expect(JSON.stringify(plugin.error.mock.calls)).not.toContain("0101234");
  });

  it("Error가 아닌 객체는 내용을 남기지 않고 종류만 남긴다", () => {
    reject({ status: 400, body: { phone: "01012345678" } });
    window.dispatchEvent(
      new ErrorEvent("error", { error: { config: { data: "01012345678" } } }),
    );
    expect(plugin.error).toHaveBeenCalledWith("[unhandled-rejection] [object]");
    expect(JSON.stringify(plugin.error.mock.calls)).not.toContain("0101234");
  });

  it("문자열 메시지와 위치(줄:열)를 남긴다", () => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Script error.",
        filename: "http://x/a.js",
        lineno: 3,
        colno: 9,
      }),
    );
    expect(plugin.error).toHaveBeenCalledWith("[uncaught] Script error. (3:9)");
  });

  it("해제하면 더 남기지 않는다", () => {
    off();
    window.dispatchEvent(new ErrorEvent("error", { message: "x" }));
    reject("y");
    expect(plugin.error).not.toHaveBeenCalled();
  });
});
