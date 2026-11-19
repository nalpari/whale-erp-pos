// 인기메뉴 실패 로그. 원인 이름과 시간 초과 여부만 남긴다 (SPEC-settings-ai-popular 7장).
import { RequestTimeoutError } from "../../shared/api/with-timeout";
import { errorSummary } from "../../shared/error-summary";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";

export function logPopularFailure(
  action: Parameters<typeof logMessages.popularFailed>[0],
  error: unknown,
) {
  void logInfo(
    logMessages.popularFailed(
      action,
      error instanceof RequestTimeoutError,
      errorSummary(error).name,
    ),
  );
}
