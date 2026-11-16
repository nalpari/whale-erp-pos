// 로그인 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (스펙 5장, 가정).
export type AccountType = "store" | "master";

export interface Session {
  accountType: AccountType;
  store: { id: string; name: string };
  accessToken: string;
  /** 자동 로그인용. 점포번호 계정에서만 받는다고 가정한다. */
  refreshToken?: string;
}

export interface FoundStoreCode {
  storeName: string;
  /** 서버가 가려서 준 점포번호 (예: HC-1***4-PO). */
  maskedStoreCode: string;
}

export interface AuthApi {
  loginWithStoreCode(storeCode: string, phone: string): Promise<Session>;
  loginWithMaster(masterId: string, password: string): Promise<Session>;
  /** 저장된 재발급 토큰으로 다시 로그인한다 (자동 로그인). */
  resume(refreshToken: string): Promise<Session>;
  findStoreCode(ownerName: string, email: string): Promise<FoundStoreCode>;
}

/** 로그인(loginWithStoreCode · loginWithMaster)에서 아이디 · 비밀번호가 틀렸을 때. 네트워크 등 원인을 알 수 없는 실패는 일반 Error다. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("아이디 또는 비밀번호 불일치");
    this.name = "InvalidCredentialsError";
  }
}

/** 점포번호 찾기에서 일치하는 정보가 없을 때. */
export class StoreNotFoundError extends Error {
  constructor() {
    super("일치하는 점포 없음");
    this.name = "StoreNotFoundError";
  }
}

/** 재발급 토큰이 만료 · 폐기됐을 때 (resume 전용). 이때만 저장된 토큰을 지운다 (스펙 4장). */
export class SessionExpiredError extends Error {
  constructor() {
    super("재발급 토큰 만료 · 폐기");
    this.name = "SessionExpiredError";
  }
}

// 모의 데이터: 개발 · 테스트용 시험 계정이다. 실제 고객 · 점포 정보가 아니다.
export const MOCK_ACCOUNTS = {
  store: { storeCode: "HC-10004-PO", phone: "01000000000" },
  master: { masterId: "master-demo", password: "demo1234!" },
  owner: { name: "홍길동", email: "owner@example.com" },
} as const;

// 모의 데이터: 시험 점포.
const MOCK_STORE = { id: "mock-store-1", name: "모의 점포 (개발용)" };
const MOCK_REFRESH_TOKEN = "mock-refresh-token";

export interface MockAuthOptions {
  /** 응답까지 걸리는 시간. 기본 300ms. */
  delayMs?: number;
  /** true면 모든 요청을 네트워크 오류로 실패시킨다. 테스트에서 쓴다. */
  networkDown?: boolean;
}

export function createMockAuthApi(options: MockAuthOptions = {}): AuthApi {
  const { delayMs = 300, networkDown = false } = options;

  function respond<T>(result: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (networkDown) {
          reject(new Error("모의 서버 연결 실패"));
          return;
        }
        try {
          resolve(result());
        } catch (error) {
          reject(error);
        }
      }, delayMs);
    });
  }

  const storeSession = (): Session => ({
    accountType: "store",
    store: MOCK_STORE,
    accessToken: "mock-access-token",
    refreshToken: MOCK_REFRESH_TOKEN,
  });

  return {
    loginWithStoreCode: (storeCode, phone) =>
      respond(() => {
        const { store } = MOCK_ACCOUNTS;
        if (storeCode !== store.storeCode || phone !== store.phone) {
          throw new InvalidCredentialsError();
        }
        return storeSession();
      }),
    loginWithMaster: (masterId, password) =>
      respond(() => {
        const { master } = MOCK_ACCOUNTS;
        if (masterId !== master.masterId || password !== master.password) {
          throw new InvalidCredentialsError();
        }
        return {
          accountType: "master",
          store: MOCK_STORE,
          accessToken: "mock-access-token",
        };
      }),
    resume: (refreshToken) =>
      respond(() => {
        if (refreshToken !== MOCK_REFRESH_TOKEN)
          throw new SessionExpiredError();
        return storeSession();
      }),
    findStoreCode: (ownerName, email) =>
      respond(() => {
        const { owner } = MOCK_ACCOUNTS;
        if (ownerName !== owner.name || email !== owner.email) {
          throw new StoreNotFoundError();
        }
        return { storeName: MOCK_STORE.name, maskedStoreCode: "HC-1***4-PO" };
      }),
  };
}
