// 창 제어는 이 모듈 한 곳에서만 Tauri를 부른다 (스펙 3장).
// 화면 코드는 AppWindow 인터페이스만 알고, 테스트 · 브라우저(`pnpm dev`)에서는 가짜 구현을 쓴다.
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

/** "창 줄이기"와 시작 창의 기본 크기. Q07 답변 전 임시값 (사용자 결정 2026-11-16). tauri.conf.json과 같게 둔다. */
export const DEFAULT_WINDOW_SIZE = { width: 1280, height: 800 } as const;

export interface AppWindow {
  /** 창을 작업표시줄로 내린다. */
  minimize(): Promise<void>;
  /** 최대화를 풀고 기본 크기로 줄인 뒤 화면 가운데에 둔다. */
  restoreDefaultSize(): Promise<void>;
  /** 창을 화면 전체 크기로 키운다. */
  maximize(): Promise<void>;
  /** 닫기 확인 없이 창을 없애 프로그램을 끝낸다. 확인은 호출하는 쪽이 먼저 받는다. */
  exit(): Promise<void>;
  /**
   * 운영체제 닫기(Alt+F4 등)를 가로챈다. 등록하면 창은 스스로 닫히지 않고 handler만 불린다.
   * 반환값은 등록을 푸는 함수다.
   */
  onCloseRequested(handler: () => void): Promise<() => void>;
}

export function createTauriWindow(): AppWindow {
  const win = getCurrentWindow();
  return {
    minimize: () => win.minimize(),
    async restoreDefaultSize() {
      // 최대화 중 크기 변경을 처리하는 방식이 플랫폼마다 달라서, 어느 OS에서든 같은 결과가 나오게 먼저 최대화를 푼다.
      if (await win.isMaximized()) {
        await win.unmaximize();
      }
      await win.setSize(
        new LogicalSize(DEFAULT_WINDOW_SIZE.width, DEFAULT_WINDOW_SIZE.height),
      );
      await win.center();
    },
    maximize: () => win.maximize(),
    // close()는 close-requested를 다시 일으켜 확인 팝업이 또 뜨므로 destroy()로 바로 없앤다.
    // 마지막 창이 없어지면 Tauri 기본 동작으로 프로그램이 끝난다.
    exit: () => win.destroy(),
    onCloseRequested(handler) {
      return win.onCloseRequested((event) => {
        // 핸들러가 끝나기 전에 막아야 창이 없어지지 않는다. 팝업 결과는 기다리지 않는다.
        event.preventDefault();
        handler();
      });
    },
  };
}

/** 테스트 · 브라우저 개발 모드용. 아무 일도 하지 않는다. */
export function createNoopWindow(): AppWindow {
  return {
    minimize: async () => {},
    restoreDefaultSize: async () => {},
    maximize: async () => {},
    // 브라우저에서는 끌 창이 없다. 성공으로 끝내면 종료 팝업이 처리 중으로 굳으므로,
    // 실패로 돌려 호출하는 쪽의 실패 경로(팝업 닫기)를 타게 한다.
    exit: async () => {
      throw new Error("Tauri 밖이라 프로그램을 종료할 수 없습니다.");
    },
    onCloseRequested: async () => () => {},
  };
}

export function createAppWindow(): AppWindow {
  return isTauri() ? createTauriWindow() : createNoopWindow();
}
