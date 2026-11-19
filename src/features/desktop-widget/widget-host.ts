// 위젯 창 · 창끼리 주고받기에서 Tauri를 부르는 곳 (T06 스펙 4장). 화면 코드는 이 인터페이스만 안다.
// 본 창 쪽(WidgetHost)과 위젯 창 쪽(WidgetClient)을 나눠 둔다. 테스트 · 브라우저(`pnpm dev`)는 가짜 구현을 쓴다.
import { isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  primaryMonitor,
} from "@tauri-apps/api/window";
import {
  WIDGET_COMMAND_EVENT,
  WIDGET_LABEL,
  WIDGET_VIEW_EVENT,
  type WidgetCommand,
  type WidgetView,
} from "./widget-protocol";
import { WIDGET_WIDTH, widgetBounds } from "./widget-position";

/** 본 창이 쓰는 쪽. */
export interface WidgetHost {
  /** 본 창이 앞에 있는지: 초점이 있고 최소화가 아니다 (3.2). */
  isMainFront(): Promise<boolean>;
  /** 본 창을 되살려(최소화였으면) 맨 앞으로 가져온다. */
  bringMainToFront(): Promise<void>;
  /** 위젯 창이 그릴 화면을 보낸다. */
  publish(view: WidgetView): Promise<void>;
  onCommand(handler: (command: WidgetCommand) => void): Promise<() => void>;
}

/** 위젯 창이 쓰는 쪽. */
export interface WidgetClient {
  onView(handler: (view: WidgetView) => void): Promise<() => void>;
  send(command: WidgetCommand): Promise<void>;
  /** 보이면 주 모니터 오른쪽 아래에 놓고 띄우고, 아니면 숨긴다. 띄울 때 초점은 가져가지 않는다(창 설정 focusable: false). */
  present(visible: boolean, contentHeight: number): Promise<void>;
}

/** 이 웹뷰가 위젯 창인지. 브라우저 개발 모드는 주소에 ?widget을 붙여 화면만 시험한다. */
export function isWidgetWindow(): boolean {
  if (isTauri()) return getCurrentWindow().label === WIDGET_LABEL;
  return new URLSearchParams(window.location.search).has("widget");
}

export function createTauriWidgetHost(): WidgetHost {
  const win = getCurrentWindow();
  return {
    isMainFront: async () => {
      const [focused, minimized] = await Promise.all([
        win.isFocused(),
        win.isMinimized(),
      ]);
      return focused && !minimized;
    },
    bringMainToFront: async () => {
      await win.unminimize();
      await win.show();
      // Windows는 다른 프로그램이 앞일 때 setFocus만으로는 작업표시줄만 깜빡일 수 있어, 잠깐 항상 위로 올렸다 내린다.
      // 중간에 실패해도 내리기는 반드시 해야 본 창이 기존 POS 화면을 계속 가리지 않는다.
      await win.setAlwaysOnTop(true);
      try {
        await win.setFocus();
      } finally {
        await win.setAlwaysOnTop(false);
      }
    },
    publish: (view) => emit(WIDGET_VIEW_EVENT, view),
    onCommand: (handler) =>
      listen<WidgetCommand>(WIDGET_COMMAND_EVENT, (e) => handler(e.payload)),
  };
}

export function createTauriWidgetClient(): WidgetClient {
  const win = getCurrentWindow();
  let visibleNow = false;
  let lastHeight = 0;
  async function doPresent(visible: boolean, contentHeight: number) {
    if (!visible) {
      visibleNow = false;
      await win.hide();
      return;
    }
    const monitor = await primaryMonitor();
    if (monitor) {
      const { position, size } = monitor.workArea;
      const bounds = widgetBounds(
        {
          x: position.x,
          y: position.y,
          width: size.width,
          height: size.height,
        },
        monitor.scaleFactor,
        contentHeight,
      );
      const move = () =>
        win.setPosition(new PhysicalPosition(bounds.x, bounds.y));
      const resize = () =>
        win.setSize(new LogicalSize(WIDGET_WIDTH, bounds.logicalHeight));
      // 커질 때는 위치를 먼저 옮겨야 아래로 늘어났다 뛰는 모습이 안 보인다. 작아질 때는 반대.
      if (bounds.logicalHeight > lastHeight) {
        await move();
        await resize();
      } else {
        await resize();
        await move();
      }
      lastHeight = bounds.logicalHeight;
    }
    // 이미 떠 있으면 다시 show하지 않는다. 호출마다 창이 활성화될 위험을 줄이려는 것이다.
    if (!visibleNow) await win.show();
    visibleNow = true;
  }
  // 호출을 하나씩 잇는다. 안 그러면 「띄움」이 끝나기 전에 온 「숨김」이 먼저 끝나 빈 위젯이 남는다.
  let chain: Promise<void> = Promise.resolve();
  return {
    onView: (handler) =>
      listen<WidgetView>(WIDGET_VIEW_EVENT, (e) => handler(e.payload)),
    send: (command) => emit(WIDGET_COMMAND_EVENT, command),
    present(visible, contentHeight) {
      const run = chain.then(() => doPresent(visible, contentHeight));
      chain = run.catch(() => {});
      return run;
    },
  };
}

/** 테스트 · 브라우저 개발 모드용. 아무 일도 하지 않고, 본 창은 늘 앞에 있다고 본다. */
export function createNoopWidgetHost(): WidgetHost {
  return {
    isMainFront: async () => true,
    bringMainToFront: async () => {},
    publish: async () => {},
    onCommand: async () => () => {},
  };
}

export function createWidgetHost(): WidgetHost {
  return isTauri() ? createTauriWidgetHost() : createNoopWidgetHost();
}

export function createNoopWidgetClient(): WidgetClient {
  return {
    onView: async () => () => {},
    send: async () => {},
    present: async () => {},
  };
}

export function createWidgetClient(): WidgetClient {
  return isTauri() ? createTauriWidgetClient() : createNoopWidgetClient();
}
