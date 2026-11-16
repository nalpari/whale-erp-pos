// 프로그램 시작 시 자동 로그인 (스펙 4장). 저장된 재발급 토큰으로 세션을 되살린다.
import { SessionExpiredError, type AuthApi, type Session } from "../api/auth";
import { errorSummary } from "../error-summary";
import type { TokenStore } from "./token-store";

/** 되살린 세션. 토큰이 없거나 실패하면 null(로그인 화면). 이 함수는 거절하지 않는다. */
export async function restoreSession(
  authApi: AuthApi,
  tokenStore: TokenStore,
): Promise<Session | null> {
  // 로그에서 저장소 오류와 서버 · 네트워크 오류를 가려 보려고 어느 단계에서 실패했는지 남긴다.
  let stage: "load" | "resume" = "load";
  try {
    const token = await tokenStore.load();
    if (!token) return null;
    stage = "resume";
    const session = await authApi.resume(token);
    // 서버가 재발급 토큰을 쓸 때마다 새로 바꿔 주면, 옛 토큰은 다음 실행 때 폐기돼 있다. 새 토큰으로 바꿔 둔다.
    // 바꾸지 못해도 이번 로그인은 진행한다.
    if (session.refreshToken && session.refreshToken !== token) {
      await tokenStore
        .save(session.refreshToken)
        .catch((error: unknown) =>
          console.error("[auto-login] 새 토큰 저장 실패", errorSummary(error)),
        );
    }
    return session;
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      // 만료 · 폐기된 토큰은 다시 써도 실패하므로 지운다.
      await tokenStore
        .clear()
        .catch((e: unknown) =>
          console.error("[auto-login] 만료 토큰 삭제 실패", errorSummary(e)),
        );
    } else {
      // 네트워크 · 저장소 오류는 일시적일 수 있어 토큰을 남긴다. 다음 실행 때 다시 시도한다 (사용자 결정 2026-11-16).
      // 토큰 값은 남기지 않는다.
      console.error("[auto-login] 자동 로그인 실패, 토큰은 남김", {
        stage,
        ...errorSummary(error),
      });
    }
    return null;
  }
}
