import { beforeEach, describe, expect, it, vi } from "vitest";

// Tauri 구현이 지켜야 할 동작만 가짜 창 객체로 확인한다. 실제 창 동작은 Windows 수동 확인.
const fakeWin = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  maximize: vi.fn(async () => {}),
  unmaximize: vi.fn(async () => {}),
  isMaximized: vi.fn(async () => false),
  setSize: vi.fn<(size: unknown) => Promise<void>>(async () => {}),
  center: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  destroy: vi.fn(async () => {}),
  onCloseRequested: vi.fn<
    (
      handler: (event: { preventDefault(): void }) => void,
    ) => Promise<() => void>
  >(async () => () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => fakeWin,
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

const { createAppWindow, createTauriWindow } = await import("./window");

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
    fakeWin.center.mockImplementationOnce(
      async () => void order.push("center"),
    );

    await createTauriWindow().restoreDefaultSize();

    expect(order).toEqual(["unmaximize", "setSize", "center"]);
    expect(fakeWin.setSize).toHaveBeenCalledWith({ width: 1280, height: 800 });
  });

  it("줄이기: 최대화 상태가 아니면 unmaximize를 부르지 않는다", async () => {
    await createTauriWindow().restoreDefaultSize();

    expect(fakeWin.unmaximize).not.toHaveBeenCalled();
    expect(fakeWin.setSize).toHaveBeenCalledTimes(1);
    expect(fakeWin.center).toHaveBeenCalledTimes(1);
  });
});
