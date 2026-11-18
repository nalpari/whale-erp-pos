// 로그인 API. 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (스펙 5장, 가정).
export type AccountType = "store" | "master";

export interface Session {
  accountType: AccountType;
  store: { id: string; code: string; name: string };
  accessToken: string;
  /** 자동 로그인용. 점포번호 계정에서만 받는다고 가정한다. */
  refreshToken?: string;
}

export interface AuthApi {
  loginWithStoreCode(
    storeCode: string,
    password: string,
    deviceName: string,
  ): Promise<Session>;
  loginWithMaster(
    erpId: string,
    password: string,
    storeCode: string,
    deviceName: string,
  ): Promise<Session>;
  /** 저장된 재발급 토큰으로 다시 로그인한다 (자동 로그인). */
  resume(refreshToken: string): Promise<Session>;
}

// 로그인 오류 (가정, 스펙 5장). 네트워크 등 원인을 알 수 없는 실패는 일반 Error다.
/** 아이디 · 비밀번호(또는 점포코드 · 비밀번호)가 틀렸을 때. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("아이디 또는 비밀번호 불일치");
    this.name = "InvalidCredentialsError";
  }
}

/** 픽업오더를 구독하지 않은 점포. */
export class NotSubscribedError extends Error {
  constructor() {
    super("픽업오더 미구독 점포");
    this.name = "NotSubscribedError";
  }
}

/** 웨일ERP 계정이 관리하지 않는 점포 (웨일ERP 탭). */
export class StoreNotManagedError extends Error {
  constructor() {
    super("계정이 관리하지 않는 점포");
    this.name = "StoreNotManagedError";
  }
}

/** 매장 프로그램 비밀번호가 설정되지 않은 점포 (점포번호 탭). */
export class PasswordNotSetError extends Error {
  constructor() {
    super("매장 프로그램 비밀번호 미설정");
    this.name = "PasswordNotSetError";
  }
}

/** 연속 실패로 서버가 잠근 상태. 잠금은 서버가 판단하고 화면은 문구만 보인다 (스펙 3.4). */
export class LoginLockedError extends Error {
  constructor() {
    super("로그인 잠김");
    this.name = "LoginLockedError";
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
// codes: 오류 경우마다 하나씩 둔 시험용 점포코드 (스펙 5장).
export const MOCK_ACCOUNTS = {
  store: { storeCode: "ST000001", password: "1234" },
  master: {
    masterId: "master-demo",
    password: "demo1234!",
    storeCode: "ST000001",
  },
  codes: {
    notSubscribed: "ST000002",
    notManaged: "ST000003",
    passwordNotSet: "ST000004",
    locked: "ST000005",
  },
} as const;

// 모의 데이터: 시험 점포.
const MOCK_STORE = {
  id: "mock-store-1",
  code: MOCK_ACCOUNTS.store.storeCode,
  name: "모의 점포 (개발용)",
};
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

  // 점포코드로 정해지는 오류. 두 탭이 같이 쓴다. 웨일ERP 탭만 StoreNotManagedError가 난다.
  function checkStoreCode(storeCode: string, kind: AccountType) {
    const { codes } = MOCK_ACCOUNTS;
    if (storeCode === codes.notSubscribed) throw new NotSubscribedError();
    if (storeCode === codes.locked) throw new LoginLockedError();
    if (kind === "master" && storeCode === codes.notManaged)
      throw new StoreNotManagedError();
    if (kind === "store" && storeCode === codes.passwordNotSet)
      throw new PasswordNotSetError();
  }

  return {
    // deviceName은 서버가 새 PC 알림 · PC별 잠금에 쓴다고 가정한다 (모의 구현은 쓰지 않는다).
    loginWithStoreCode: (storeCode, password) =>
      respond(() => {
        checkStoreCode(storeCode, "store");
        const { store } = MOCK_ACCOUNTS;
        if (storeCode !== store.storeCode || password !== store.password) {
          throw new InvalidCredentialsError();
        }
        return storeSession();
      }),
    loginWithMaster: (erpId, password, storeCode) =>
      respond(() => {
        checkStoreCode(storeCode, "master");
        const { master } = MOCK_ACCOUNTS;
        if (
          erpId !== master.masterId ||
          password !== master.password ||
          storeCode !== master.storeCode
        ) {
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
  };
}
