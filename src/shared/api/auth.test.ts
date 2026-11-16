import { describe, expect, it } from "vitest";
import {
  createMockAuthApi,
  InvalidCredentialsError,
  MOCK_ACCOUNTS,
  StoreNotFoundError,
} from "./auth";

const api = createMockAuthApi({ delayMs: 0 });
const { store, master, owner } = MOCK_ACCOUNTS;

describe("createMockAuthApi", () => {
  it("점포번호 계정: 맞으면 store 세션과 재발급 토큰, 틀리면 InvalidCredentialsError", async () => {
    const session = await api.loginWithStoreCode(store.storeCode, store.phone);
    expect(session.accountType).toBe("store");
    expect(session.refreshToken).toBeTruthy();
    await expect(
      api.loginWithStoreCode(store.storeCode, "01099999999"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("마스터 계정: 맞으면 master 세션(재발급 토큰 없음), 틀리면 InvalidCredentialsError", async () => {
    const session = await api.loginWithMaster(master.masterId, master.password);
    expect(session.accountType).toBe("master");
    expect(session.refreshToken).toBeUndefined();
    await expect(
      api.loginWithMaster(master.masterId, "x"),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("resume: 발급한 토큰만 통과한다", async () => {
    const { refreshToken } = await api.loginWithStoreCode(
      store.storeCode,
      store.phone,
    );
    await expect(api.resume(refreshToken ?? "")).resolves.toMatchObject({
      accountType: "store",
    });
    await expect(api.resume("expired")).rejects.toThrow();
  });

  it("findStoreCode: 맞으면 가린 점포번호, 틀리면 StoreNotFoundError", async () => {
    await expect(
      api.findStoreCode(owner.name, owner.email),
    ).resolves.toMatchObject({ maskedStoreCode: "HC-1***4-PO" });
    await expect(
      api.findStoreCode(owner.name, "x@example.com"),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
  });

  it("networkDown이면 일반 Error로 실패한다", async () => {
    const down = createMockAuthApi({ delayMs: 0, networkDown: true });
    const result = down.loginWithStoreCode(store.storeCode, store.phone);
    await expect(result).rejects.toThrow();
    await expect(result).rejects.not.toBeInstanceOf(InvalidCredentialsError);
  });
});
