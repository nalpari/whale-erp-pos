// 창 제어는 이 모듈 한 곳에서만 Tauri를 부른다 (스펙 3장).
// 화면 코드는 AppWindow 인터페이스만 알고, 테스트 · 브라우저(`pnpm dev`)에서는 가짜 구현을 쓴다.
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize,
} from "@tauri-apps/api/window";
import {
  defaultWindowSize,
  loadSavedBounds,
  pickRestorableBounds,
  saveBounds,
  visiblePoint,
} from "./window-bounds";
import { errorSummary } from "../error-summary";

/** 창을 옮기거나 크기를 바꾼 뒤 이 시간 동안 더 바뀌지 않으면 저장한다 (끌기 중 매번 쓰지 않으려고). */
const SAVE_DEBOUNCE_MS = 300;

export interface AppWindow {
  /** 창을 작업표시줄로 내린다. */
  minimize(): Promise<void>;
  /** 최대화를 풀고 기본 크기(화면이 작으면 작업표시줄을 뺀 화면 크기)로 줄인 뒤 그 작업 영역 가운데에 둔다. */
  restoreDefaultSize(): Promise<void>;
  /** 창을 화면 전체 크기로 키운다. */
  maximize(): Promise<void>;
  /** 프로그램을 껐다 다시 켠다 (Tauri 기본 기능, 스펙 3장). 명령이 닿으면 새로 켜는 데 성공하든 말든 이 프로세스는 끝난다. 명령 자체가 실패할 때만 돌아온다. */
  restart(): Promise<void>;
  /** 지금 최대화(화면 전체) 상태인지. */
  isMaximized(): Promise<boolean>;
  /** 최대화 여부가 바뀔 때 부른다 (더보기 메뉴의 늘리기 / 줄이기 중 하나만 보이게). 반환값은 등록을 푸는 함수. */
  onMaximizedChange(handler: (maximized: boolean) => void): Promise<() => void>;
  /**
   * 저장해 둔 크기 · 위치를 되살리고(처음이거나 쓸 수 없으면 화면 전체), 그 뒤로 바뀔 때마다 저장한다 (스펙 2.5).
   * 반환값은 저장을 멈추는 함수.
   */
  manageBounds(): Promise<() => void>;
  /** 닫기 확인 없이 창을 없애 프로그램을 끝낸다. 확인은 호출하는 쪽이 먼저 받는다. */
  exit(): Promise<void>;
  /**
   * 운영체제 닫기(Alt+F4 등)를 가로챈다. 등록하면 창은 스스로 닫히지 않고 handler만 불린다.
   * 반환값은 등록을 푸는 함수다.
   */
  onCloseRequested(handler: () => void): Promise<() => void>;
}

/** 저장값을 되살린다. 쓸 수 없으면(처음 실행 포함) 화면 전체로 연다. */
async function restoreBounds(win: ReturnType<typeof getCurrentWindow>) {
  const found = await availableMonitors();
  const monitors = found.map((m) => ({
    x: m.position.x,
    y: m.position.y,
    width: m.size.width,
    height: m.size.height,
  }));
  const stored = loadSavedBounds();
  // 최소 크기 검사는 저장된 창이 있던 모니터의 배율로 한다 (배율이 다른 모니터가 섞인 PC).
  const point =
    stored?.x !== undefined &&
    stored.y !== undefined &&
    stored.width !== undefined
      ? visiblePoint({ x: stored.x, y: stored.y, width: stored.width })
      : null;
  const home = point
    ? found.find(
        (m) =>
          point.x >= m.position.x &&
          point.x < m.position.x + m.size.width &&
          point.y >= m.position.y &&
          point.y < m.position.y + m.size.height,
      )
    : undefined;
  const scale = home?.scaleFactor ?? (await win.scaleFactor());
  const saved = pickRestorableBounds(stored, monitors, scale);
  if (
    saved?.width !== undefined &&
    saved.height !== undefined &&
    saved.x !== undefined &&
    saved.y !== undefined
  ) {
    // 위치를 먼저 옮겨 저장했던 모니터로 간 뒤 크기를 정한다. 반대로 하면 배율이 다른 모니터에서 크기가 다시 바뀔 수 있다.
    await win.setPosition(new PhysicalPosition(saved.x, saved.y));
    await win.setSize(new PhysicalSize(saved.width, saved.height));
  }
  // 저장값이 없거나 버려졌으면 화면 전체 (처음 실행). 최대화였으면 크기를 먼저 맞춘 뒤 키워서, 다음에 원래 크기로 돌리면 마지막 크기로 돌아온다.
  if (!saved || saved.maximized) await win.maximize();
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
      // 화면이 기본 크기보다 작으면 작업표시줄을 뺀 화면(workArea)에 맞춘다.
      const monitor = await currentMonitor();
      const size = monitor
        ? defaultWindowSize({
            width: monitor.workArea.size.width / monitor.scaleFactor,
            height: monitor.workArea.size.height / monitor.scaleFactor,
          })
        : defaultWindowSize({ width: Infinity, height: Infinity });
      await win.setSize(new LogicalSize(size.width, size.height));
      // win.center()는 작업표시줄을 포함한 모니터 전체 기준이라, 작은 화면에서 아래가 가려진다. 작업 영역 기준으로 직접 가운데에 둔다.
      if (monitor) {
        const { position, size: area } = monitor.workArea;
        const inner = await win.outerSize();
        await win.setPosition(
          new PhysicalPosition(
            // 창이 최소 크기 때문에 작업 영역보다 커져도 왼쪽 · 위가 화면 밖으로 나가지 않게 막는다 (제목 표시줄이 없어 끌어 내릴 수 없다).
            position.x +
              Math.max(0, Math.round((area.width - inner.width) / 2)),
            position.y +
              Math.max(0, Math.round((area.height - inner.height) / 2)),
          ),
        );
      } else {
        await win.center();
      }
    },
    maximize: () => win.maximize(),
    // close()는 close-requested를 다시 일으켜 확인 팝업이 또 뜨므로 destroy()로 바로 없앤다.
    // 마지막 창이 없어지면 Tauri 기본 동작으로 프로그램이 끝난다.
    exit: () => win.destroy(),
    restart: () => invoke("restart_app"),
    isMaximized: () => win.isMaximized(),
    onMaximizedChange(handler) {
      // 최대화 · 복원은 크기 변경으로 오므로 크기가 바뀔 때마다 다시 읽는다.
      return win.onResized(() => {
        win
          .isMaximized()
          .then(handler)
          .catch((error: unknown) =>
            console.error(
              "[window] 최대화 상태 갱신 실패",
              errorSummary(error),
            ),
          );
      });
    },
    async manageBounds() {
      // 되살리기가 실패해도(모니터 정보를 못 읽음 등) 이번 실행의 저장은 계속해야 하므로 따로 감싼다. 실패하면 화면 전체로 연다.
      try {
        await restoreBounds(win);
      } catch (error) {
        console.error(
          "[window] 크기 · 위치 되살리기 실패",
          errorSummary(error),
        );
        await win.maximize();
      }

      let timer: ReturnType<typeof setTimeout> | undefined;
      let reported = false;
      const save = async () => {
        // 최소화 중에는 창이 화면 밖 좌표 · 0 크기로 오므로 저장하지 않는다.
        if (await win.isMinimized()) return;
        const maximized = await win.isMaximized();
        if (maximized) {
          // 마지막 보통 크기(x~height)는 그대로 두고 최대화 여부만 바꾼다.
          // 다음 실행이나 헤더 두 번 누르기로 원래 크기로 돌릴 때 그 크기로 돌아온다. [창 줄이기] 메뉴는 기본 크기로 간다.
          saveBounds({ ...loadSavedBounds(), maximized });
          return;
        }
        const [pos, size] = await Promise.all([
          win.outerPosition(),
          win.innerSize(),
        ]);
        saveBounds({
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
          maximized: false,
        });
      };
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () =>
            void save().catch((error: unknown) => {
              // 창을 끌 때마다 생기므로 한 번만 남긴다. 기억하지 못할 뿐 창 사용에는 영향이 없다.
              if (reported) return;
              reported = true;
              console.error(
                "[window] 크기 · 위치 저장 실패",
                errorSummary(error),
              );
            }),
          SAVE_DEBOUNCE_MS,
        );
      };
      // 하나씩 등록한다. 두 번째가 실패하면 첫 번째를 풀어 구독이 새지 않게 한다.
      const unlisteners: Array<() => void> = [];
      try {
        unlisteners.push(await win.onMoved(schedule));
        unlisteners.push(await win.onResized(schedule));
      } catch (error) {
        unlisteners.forEach((fn) => fn());
        throw error;
      }
      return () => {
        clearTimeout(timer);
        unlisteners.forEach((fn) => fn());
      };
    },
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
    restart: async () => {
      throw new Error("Tauri 밖이라 프로그램을 다시시작할 수 없습니다.");
    },
    isMaximized: async () => false,
    onMaximizedChange: async () => () => {},
    manageBounds: async () => () => {},
    onCloseRequested: async () => () => {},
  };
}

export function createAppWindow(): AppWindow {
  return isTauri() ? createTauriWindow() : createNoopWindow();
}
