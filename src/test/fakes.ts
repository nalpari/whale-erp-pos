// 테스트용 가짜 구현. "어떤 함수가 불렸는지"만 확인하기 위해 쓴다 (스펙 7장).
import { vi } from "vitest";
import type { StoreStatusApi } from "../shared/api/store-status";
import type { AppWindow } from "../shared/platform/window";

export function createFakeWindow() {
  let closeHandler: (() => void) | null = null;
  let maximizedHandler: ((maximized: boolean) => void) | null = null;
  let maximized = false;
  const win = {
    minimize: vi.fn(async () => {}),
    restoreDefaultSize: vi.fn(async () => {}),
    maximize: vi.fn(async () => {}),
    exit: vi.fn(async () => {}),
    restart: vi.fn(async () => {}),
    isMaximized: vi.fn(async () => maximized),
    onMaximizedChange: vi.fn(async (handler: (m: boolean) => void) => {
      maximizedHandler = handler;
      return () => {
        if (maximizedHandler === handler) maximizedHandler = null;
      };
    }),
    manageBounds: vi.fn(async () => () => {}),
    onCloseRequested: vi.fn(async (handler: () => void) => {
      closeHandler = handler;
      return () => {
        if (closeHandler === handler) closeHandler = null;
      };
    }),
  } satisfies AppWindow;
  return {
    win,
    /** 창이 최대화됐다 풀렸다고 알린다. */
    setMaximized(next: boolean) {
      maximized = next;
      maximizedHandler?.(next);
    },
    /** 운영체제 닫기(Alt+F4)를 흉내 낸다. 등록된 핸들러가 없으면 false. */
    requestClose(): boolean {
      if (!closeHandler) return false;
      closeHandler();
      return true;
    },
  };
}

interface PendingCall {
  accepting: boolean;
  resolve: () => void;
  reject: (error: Error) => void;
}

/** 요청마다 테스트가 직접 성공 · 실패를 정하는 가짜 API. */
export function createControlledStoreStatusApi() {
  const calls: PendingCall[] = [];
  const api: StoreStatusApi = {
    setAcceptingOrders: vi.fn(
      (accepting: boolean) =>
        new Promise<void>((resolve, reject) => {
          calls.push({ accepting, resolve, reject });
        }),
    ),
  };
  return {
    api,
    calls,
    last(): PendingCall {
      const call = calls[calls.length - 1];
      if (!call) throw new Error("아직 요청이 없습니다.");
      return call;
    },
  };
}
