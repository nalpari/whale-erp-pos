import { describe, expect, it, vi } from "vitest";
import {
  createMockAuthApi,
  SessionExpiredError,
  type AuthApi,
} from "../api/auth";
vi.mock("../log/log", () => ({ logInfo: vi.fn() }));
import { restoreSession } from "./restore-session";
import { createMemoryTokenStore } from "./token-store";

const api = createMockAuthApi({ delayMs: 0 });

describe("restoreSession (스펙 4장 자동 로그인 시작 흐름)", () => {
  it("저장된 토큰이 없으면 서버에 묻지 않고 null", async () => {
    const authApi: AuthApi = { ...api, resume: vi.fn() };
    expect(await restoreSession(authApi, createMemoryTokenStore())).toBeNull();
    expect(authApi.resume).not.toHaveBeenCalled();
  });

  it("토큰이 유효하면 세션으로 시작한다", async () => {
    const store = createMemoryTokenStore("mock-refresh-token");
    expect(await restoreSession(api, store)).toMatchObject({
      accountType: "store",
    });
  });

  it("만료 · 폐기(SessionExpiredError)면 토큰을 지우고 null", async () => {
    const store = createMemoryTokenStore("expired-token");
    expect(await restoreSession(api, store)).toBeNull();
    expect(await store.load()).toBeNull();
  });

  it("네트워크 오류면 토큰을 남기고 null (다음 실행 때 다시 시도)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryTokenStore("mock-refresh-token");
    const down = createMockAuthApi({ delayMs: 0, networkDown: true });
    expect(await restoreSession(down, store)).toBeNull();
    expect(await store.load()).toBe("mock-refresh-token");
    vi.mocked(console.error).mockRestore();
  });

  it("저장소를 읽지 못하면 null (로그인 화면으로)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryTokenStore();
    vi.spyOn(store, "load").mockRejectedValue(new Error("keyring"));
    expect(await restoreSession(api, store)).toBeNull();
    vi.mocked(console.error).mockRestore();
  });

  it("모의 resume은 모르는 토큰에 SessionExpiredError를 던진다", async () => {
    await expect(api.resume("x")).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("resume이 새 재발급 토큰을 주면 그 토큰으로 바꿔 저장한다 (토큰을 매번 바꾸는 서버 대비)", async () => {
    const store = createMemoryTokenStore("old-token");
    const authApi: AuthApi = {
      ...api,
      resume: async () => ({
        accountType: "store",
        store: { id: "s1", code: "ST000001", name: "시험 점포" },
        accessToken: "a",
        refreshToken: "new-token",
      }),
    };
    await restoreSession(authApi, store);
    expect(await store.load()).toBe("new-token");
  });

  it("새 토큰 저장이 실패해도 세션을 돌려준다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryTokenStore("old-token");
    vi.spyOn(store, "save").mockRejectedValue(new Error("keyring"));
    const authApi: AuthApi = {
      ...api,
      resume: async () => ({
        accountType: "store",
        store: { id: "s1", code: "ST000001", name: "시험 점포" },
        accessToken: "a",
        refreshToken: "new-token",
      }),
    };
    expect(await restoreSession(authApi, store)).not.toBeNull();
    vi.mocked(console.error).mockRestore();
  });

  it("만료 토큰 삭제가 실패해도 거절하지 않고 null, 실패는 로그에 남긴다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryTokenStore("expired-token");
    vi.spyOn(store, "clear").mockRejectedValue(new Error("keyring"));
    expect(await restoreSession(api, store)).toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("restoreSession 로그 (SPEC-logging 2.3-3)", () => {
  async function run(
    authApi: AuthApi,
    store: ReturnType<typeof createMemoryTokenStore>,
  ) {
    const { logInfo } = await import("../log/log");
    vi.mocked(logInfo).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await restoreSession(authApi, store);
    vi.mocked(console.error).mockRestore();
    return vi.mocked(logInfo).mock.calls.map((c) => c[0]);
  }

  it("성공 · 만료로 삭제 · 네트워크 오류로 유지를 각각 한 줄 남기고, 토큰이 없으면 남기지 않는다", async () => {
    expect(
      await run(api, createMemoryTokenStore("mock-refresh-token")),
    ).toEqual(["자동 로그인 재개: 성공"]);
    expect(await run(api, createMemoryTokenStore("expired-token"))).toEqual([
      "자동 로그인 재개: 토큰 만료로 삭제",
    ]);
    const down = createMockAuthApi({ delayMs: 0, networkDown: true });
    expect(
      await run(down, createMemoryTokenStore("mock-refresh-token")),
    ).toEqual(["자동 로그인 재개: 네트워크 · 저장소 오류로 토큰 유지"]);
    expect(await run(api, createMemoryTokenStore())).toEqual([]);
  });

  it("토큰을 지우지 못하면 '삭제'라고 남기지 않는다", async () => {
    const store = createMemoryTokenStore("expired-token");
    vi.spyOn(store, "clear").mockRejectedValue(new Error("keyring"));
    expect(await run(api, store)).toEqual([]);
  });
});
