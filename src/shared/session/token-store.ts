// 자동 로그인 재발급 토큰 저장소 (스펙 4장). 매장 프로그램 비밀번호는 여기에 넣지 않는다.
// 실제 저장은 Rust(src-tauri/src/auto_login.rs)가 OS 보안 저장소에 한다. 테스트 · 브라우저에서는 메모리 구현을 쓴다.
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface TokenStore {
  /** 저장된 토큰. 없으면 null. */
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  /** 저장된 토큰이 없어도 성공한다. */
  clear(): Promise<void>;
}

export function createTauriTokenStore(): TokenStore {
  return {
    load: () => invoke<string | null>("load_refresh_token"),
    save: (token) => invoke("save_refresh_token", { token }),
    clear: () => invoke("clear_refresh_token"),
  };
}

/** 테스트 · 브라우저 개발 모드용. 프로그램을 다시 켜면 사라진다. */
export function createMemoryTokenStore(
  initial: string | null = null,
): TokenStore {
  let token = initial;
  return {
    load: async () => token,
    save: async (value) => {
      token = value;
    },
    clear: async () => {
      token = null;
    },
  };
}

export function createTokenStore(): TokenStore {
  return isTauri() ? createTauriTokenStore() : createMemoryTokenStore();
}
