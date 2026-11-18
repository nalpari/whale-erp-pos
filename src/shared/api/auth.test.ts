import { describe, expect, it } from "vitest";
import {
  createMockAuthApi,
  InvalidCredentialsError,
  LoginLockedError,
  MOCK_ACCOUNTS,
  NotSubscribedError,
  PasswordNotSetError,
  StoreNotManagedError,
} from "./auth";

const api = createMockAuthApi({ delayMs: 0 });
const { store, master, codes } = MOCK_ACCOUNTS;
const PC = "TEST-PC";

describe("createMockAuthApi", () => {
  it("점포번호 계정: 맞으면 store 세션과 재발급 토큰, 틀리면 InvalidCredentialsError", async () => {
    const session = await api.loginWithStoreCode(
      store.storeCode,
      store.password,
      PC,
    );
    expect(session.accountType).toBe("store");
    expect(session.store.code).toBe(store.storeCode);
    expect(session.refreshToken).toBeTruthy();
    await expect(
      api.loginWithStoreCode(store.storeCode, "x", PC),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("웨일ERP 계정: 맞으면 master 세션(재발급 토큰 없음), 틀리면 InvalidCredentialsError", async () => {
    const session = await api.loginWithMaster(
      master.masterId,
      master.password,
      master.storeCode,
      PC,
    );
    expect(session.accountType).toBe("master");
    expect(session.refreshToken).toBeUndefined();
    await expect(
      api.loginWithMaster(master.masterId, "x", master.storeCode, PC),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("resume: 발급한 토큰만 통과한다", async () => {
    const { refreshToken } = await api.loginWithStoreCode(
      store.storeCode,
      store.password,
      PC,
    );
    await expect(api.resume(refreshToken ?? "")).resolves.toMatchObject({
      accountType: "store",
    });
    await expect(api.resume("expired")).rejects.toThrow();
  });

  it("오류 경우마다 시험용 점포코드가 있다", async () => {
    const store1 = (code: string) =>
      api.loginWithStoreCode(code, store.password, PC);
    const master1 = (code: string) =>
      api.loginWithMaster(master.masterId, master.password, code, PC);

    await expect(store1(codes.notSubscribed)).rejects.toBeInstanceOf(
      NotSubscribedError,
    );
    await expect(master1(codes.notSubscribed)).rejects.toBeInstanceOf(
      NotSubscribedError,
    );
    await expect(master1(codes.notManaged)).rejects.toBeInstanceOf(
      StoreNotManagedError,
    );
    await expect(store1(codes.passwordNotSet)).rejects.toBeInstanceOf(
      PasswordNotSetError,
    );
    await expect(store1(codes.locked)).rejects.toBeInstanceOf(LoginLockedError);
    await expect(master1(codes.locked)).rejects.toBeInstanceOf(
      LoginLockedError,
    );
  });

  it("networkDown이면 일반 Error로 실패한다", async () => {
    const down = createMockAuthApi({ delayMs: 0, networkDown: true });
    const result = down.loginWithStoreCode(store.storeCode, store.password, PC);
    await expect(result).rejects.toThrow();
    await expect(result).rejects.not.toBeInstanceOf(InvalidCredentialsError);
  });
});
