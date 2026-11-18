import { beforeEach, describe, expect, it, vi } from "vitest";

// Tauri 구현이 지켜야 할 동작만 가짜 창 객체로 확인한다. 실제 창 동작은 Windows 수동 확인.
const fakeWin = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  maximize: vi.fn(async () => {}),
  unmaximize: vi.fn(async () => {}),
  isMaximized: vi.fn(async () => false),
  setSize: vi.fn<(size: unknown) => Promise<void>>(async () => {}),
  center: vi.fn(async () => {}),
  setPosition: vi.fn<(pos: unknown) => Promise<void>>(async () => {}),
  isMinimized: vi.fn(async () => false),
  scaleFactor: vi.fn(async () => 1),
  outerPosition: vi.fn(async () => ({ x: 120, y: 90 })),
  outerSize: vi.fn(async () => ({ width: 1280, height: 800 })),
  innerSize: vi.fn(async () => ({ width: 1300, height: 820 })),
  onMoved: vi.fn<(h: () => void) => Promise<() => void>>(async () => () => {}),
  onResized: vi.fn<(h: () => void) => Promise<() => void>>(
    async () => () => {},
  ),
  close: vi.fn(async () => {}),
  destroy: vi.fn(async () => {}),
  onCloseRequested: vi.fn<
    (
      handler: (event: { preventDefault(): void }) => void,
    ) => Promise<() => void>
  >(async () => () => {}),
}));

const monitor = vi.hoisted(() => ({
  scaleFactor: 1,
  workArea: {
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1040 },
  },
}));
const monitors = vi.hoisted(() => [
  {
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
  },
]);
const invokeMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => fakeWin,
  currentMonitor: async () => monitor,
  availableMonitors: async () => monitors,
  LogicalSize: class LogicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  PhysicalSize: class PhysicalSize {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
  PhysicalPosition: class PhysicalPosition {
    constructor(
      public x: number,
      public y: number,
    ) {}
  },
}));

const { createAppWindow, createTauriWindow } = await import("./window");
const { LogicalSize, PhysicalSize } = await import("@tauri-apps/api/window");
const { saveBounds, loadSavedBounds } = await import("./window-bounds");

describe("createAppWindow", () => {
  it("Tauri 밖(테스트 · 브라우저)에서는 아무 일도 하지 않는 구현을 준다", async () => {
    const win = createAppWindow();

    await win.minimize();
    await expect(win.exit()).rejects.toThrow("Tauri 밖");
    const unlisten = await win.onCloseRequested(() => {});
    expect(unlisten).toBeTypeOf("function");
    expect(fakeWin.minimize).not.toHaveBeenCalled();
    expect(fakeWin.destroy).not.toHaveBeenCalled();
  });
});

describe("createTauriWindow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exit는 close가 아니라 destroy를 부른다 (close는 닫기 확인을 다시 일으킨다)", async () => {
    await createTauriWindow().exit();

    expect(fakeWin.destroy).toHaveBeenCalledTimes(1);
    expect(fakeWin.close).not.toHaveBeenCalled();
  });

  it("닫기 요청은 항상 막고 handler를 부른다", async () => {
    const handler = vi.fn();
    await createTauriWindow().onCloseRequested(handler);
    const tauriHandler = fakeWin.onCloseRequested.mock.calls[0][0];
    const event = { preventDefault: vi.fn() };

    tauriHandler(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("줄이기: 최대화 상태면 먼저 풀고 1280×800으로 바꾼 뒤 가운데에 둔다", async () => {
    fakeWin.isMaximized.mockResolvedValueOnce(true);
    const order: string[] = [];
    fakeWin.unmaximize.mockImplementationOnce(
      async () => void order.push("unmaximize"),
    );
    fakeWin.setSize.mockImplementationOnce(
      async () => void order.push("setSize"),
    );
    fakeWin.setPosition.mockImplementationOnce(
      async () => void order.push("setPosition"),
    );

    await createTauriWindow().restoreDefaultSize();

    expect(order).toEqual(["unmaximize", "setSize", "setPosition"]);
    // 논리 크기(배율 적용 전)로 준다
    expect(fakeWin.setSize.mock.calls[0][0]).toBeInstanceOf(LogicalSize);
    expect(fakeWin.setSize).toHaveBeenCalledWith({ width: 1280, height: 800 });
  });

  it("줄이기: 최대화 상태가 아니면 unmaximize를 부르지 않는다", async () => {
    await createTauriWindow().restoreDefaultSize();

    expect(fakeWin.unmaximize).not.toHaveBeenCalled();
    expect(fakeWin.setSize).toHaveBeenCalledTimes(1);
    expect(fakeWin.setPosition).toHaveBeenCalledTimes(1);
  });

  it("줄이기: 작업표시줄을 뺀 화면이 기본 크기보다 작으면 그 크기에 맞춘다", async () => {
    monitor.workArea.size = { width: 1024, height: 780 };
    fakeWin.outerSize.mockResolvedValueOnce({ width: 1024, height: 780 });

    await createTauriWindow().restoreDefaultSize();
    monitor.workArea.size = { width: 1920, height: 1040 };

    expect(fakeWin.setSize).toHaveBeenCalledWith({ width: 1024, height: 780 });
    // 작업 영역 왼쪽 위에 맞는다 (작업표시줄 뒤로 가리지 않는다)
    expect(fakeWin.setPosition).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it("줄이기: 배율 150%면 작업 영역(물리)을 논리로 바꿔 비교하고, 작업 영역 가운데에 둔다", async () => {
    monitor.scaleFactor = 1.5;
    monitor.workArea.size = { width: 1920, height: 1040 }; // 논리 1280 × 693 → 최소 높이 768으로 올린다
    fakeWin.outerSize.mockResolvedValueOnce({ width: 1920, height: 1040 });

    await createTauriWindow().restoreDefaultSize();
    monitor.scaleFactor = 1;

    expect(fakeWin.setSize).toHaveBeenCalledWith({
      width: 1280,
      height: 768,
    });
    expect(fakeWin.setPosition).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it("줄이기: OS가 최소 크기로 창을 키워도 왼쪽 · 위가 작업 영역 밖으로 나가지 않는다", async () => {
    fakeWin.outerSize.mockResolvedValueOnce({ width: 1920, height: 1100 });

    await createTauriWindow().restoreDefaultSize();

    expect(fakeWin.setPosition).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it("다시시작은 Rust 명령 restart_app을 부른다", async () => {
    await createTauriWindow().restart();

    expect(invokeMock).toHaveBeenCalledWith("restart_app");
  });

  it("최대화 여부가 바뀌면 크기 변경 때 다시 읽어 알린다", async () => {
    const handler = vi.fn();
    await createTauriWindow().onMaximizedChange(handler);
    fakeWin.isMaximized.mockResolvedValueOnce(true);

    await fakeWin.onResized.mock.calls[0][0]();

    expect(handler).toHaveBeenCalledWith(true);
  });
});

describe("manageBounds (스펙 2.5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("처음 실행(저장값 없음)이면 화면 전체로 연다", async () => {
    await createTauriWindow().manageBounds();

    expect(fakeWin.maximize).toHaveBeenCalledTimes(1);
    expect(fakeWin.setSize).not.toHaveBeenCalled();
  });

  it("저장값이 쓸 만하면 그 크기 · 위치로 연다", async () => {
    saveBounds({ x: 100, y: 80, width: 1280, height: 800, maximized: false });

    await createTauriWindow().manageBounds();

    // 저장한 값은 물리 픽셀이라 PhysicalSize로 되살린다
    expect(fakeWin.setSize.mock.calls[0][0]).toBeInstanceOf(PhysicalSize);
    expect(fakeWin.setSize).toHaveBeenCalledWith({ width: 1280, height: 800 });
    expect(fakeWin.setPosition).toHaveBeenCalledWith({ x: 100, y: 80 });
    expect(fakeWin.maximize).not.toHaveBeenCalled();
  });

  it("저장했던 모니터의 배율로 최소 크기를 판단한다 (배율이 다른 모니터)", async () => {
    // 배율 1.0 모니터에 1100px 창: 150% 주 모니터 기준으로 보면 논리 733 < 1024로 잘못 버려진다.
    monitors.push({
      position: { x: 1920, y: 0 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
    });
    // 창 자신의 배율(1.5)이 아니라 저장했던 모니터의 배율(1)로 판단해야 하므로, 이 값은 쓰이지 않아야 한다.
    fakeWin.scaleFactor.mockResolvedValue(1.5);
    saveBounds({ x: 2100, y: 80, width: 1100, height: 800, maximized: false });

    await createTauriWindow().manageBounds();
    monitors.pop();
    fakeWin.scaleFactor.mockResolvedValue(1);

    expect(fakeWin.setSize).toHaveBeenCalledWith({ width: 1100, height: 800 });
  });

  it("최대화였으면 크기 · 위치를 맞춘 뒤 최대화한다", async () => {
    saveBounds({ x: 100, y: 80, width: 1280, height: 800, maximized: true });

    await createTauriWindow().manageBounds();

    expect(fakeWin.setSize).toHaveBeenCalledTimes(1);
    expect(fakeWin.maximize).toHaveBeenCalledTimes(1);
  });

  it("저장값이 모니터 밖이면 버리고 화면 전체로 연다", async () => {
    saveBounds({ x: 5000, y: 80, width: 1280, height: 800, maximized: false });

    await createTauriWindow().manageBounds();

    expect(fakeWin.setSize).not.toHaveBeenCalled();
    expect(fakeWin.maximize).toHaveBeenCalledTimes(1);
  });

  it("창을 옮기거나 크기를 바꾸면 잠시 뒤 마지막 크기 · 위치를 저장한다", async () => {
    vi.useFakeTimers();
    await createTauriWindow().manageBounds();

    fakeWin.onResized.mock.calls[0][0]();
    await vi.advanceTimersByTimeAsync(400);

    expect(loadSavedBounds()).toEqual({
      x: 120,
      y: 90,
      width: 1300,
      height: 820,
      maximized: false,
    });
  });

  it("멈추면 이벤트 구독을 풀고, 기다리던 저장도 하지 않는다", async () => {
    vi.useFakeTimers();
    const unlisten = vi.fn();
    fakeWin.onMoved.mockResolvedValueOnce(unlisten);
    const stop = await createTauriWindow().manageBounds();
    fakeWin.onMoved.mock.calls[0][0]();

    stop();
    await vi.advanceTimersByTimeAsync(400);

    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(loadSavedBounds()).toBeNull();
  });

  it("최대화 중에는 보통 크기를 지우지 않고 최대화 여부만 바꿔 저장한다", async () => {
    vi.useFakeTimers();
    saveBounds({ x: 100, y: 80, width: 1280, height: 800, maximized: false });
    await createTauriWindow().manageBounds();
    fakeWin.isMaximized.mockResolvedValue(true);

    fakeWin.onResized.mock.calls[0][0]();
    await vi.advanceTimersByTimeAsync(400);
    fakeWin.isMaximized.mockResolvedValue(false);

    expect(loadSavedBounds()).toEqual({
      x: 100,
      y: 80,
      width: 1280,
      height: 800,
      maximized: true,
    });
  });

  it("처음 실행에서 창이 바뀌면 최대화 여부만 저장하고, 그 값으로 다시 열면 최대화만 한다", async () => {
    vi.useFakeTimers();
    await createTauriWindow().manageBounds();
    fakeWin.isMaximized.mockResolvedValue(true);
    fakeWin.onResized.mock.calls[0][0]();
    await vi.advanceTimersByTimeAsync(400);
    fakeWin.isMaximized.mockResolvedValue(false);
    expect(loadSavedBounds()).toEqual({ maximized: true });
    vi.clearAllMocks();

    await createTauriWindow().manageBounds();

    expect(fakeWin.maximize).toHaveBeenCalledTimes(1);
    expect(fakeWin.setSize).not.toHaveBeenCalled();
    expect(fakeWin.setPosition).not.toHaveBeenCalled();
  });

  it("되살리기가 실패해도 화면 전체로 열고 저장은 계속한다", async () => {
    saveBounds({ x: 100, y: 80, width: 1280, height: 800, maximized: false });
    fakeWin.setSize.mockRejectedValueOnce(new Error("x"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await createTauriWindow().manageBounds();

    expect(fakeWin.maximize).toHaveBeenCalledTimes(1);
    expect(fakeWin.onResized).toHaveBeenCalledTimes(1);
  });

  it("최소화 중에는 저장하지 않는다", async () => {
    vi.useFakeTimers();
    await createTauriWindow().manageBounds();
    fakeWin.isMinimized.mockResolvedValueOnce(true);

    fakeWin.onMoved.mock.calls[0][0]();
    await vi.advanceTimersByTimeAsync(400);

    expect(loadSavedBounds()).toBeNull();
  });
});
