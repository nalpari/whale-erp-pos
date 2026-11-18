// 로그인 입력 폼. 점포번호 탭과 웨일ERP 계정 탭이 함께 쓴다 (화면정의서 p.8~9, 기획자 Q09~Q15).
import { useState, type FormEvent } from "react";
import { withTimeout } from "../../shared/api/with-timeout";
import { errorSummary } from "../../shared/error-summary";
import { logInfo } from "../../shared/log/log";
import {
  logMessages,
  type LoginFailReason,
} from "../../shared/log/log-messages";
import {
  InvalidCredentialsError,
  LoginLockedError,
  NotSubscribedError,
  PasswordNotSetError,
  StoreNotManagedError,
  type AccountType,
  type AuthApi,
  type Session,
} from "../../shared/api/auth";
import { getDeviceName, openWhaleErp } from "../../shared/platform/system";
import { saveLastStoreCode } from "../../shared/session/last-store-code";
import { EyeIcon, EyeOffIcon } from "./EyeIcons";
import {
  ERP_TAB_HINT,
  INVALID_CREDENTIALS_MESSAGE,
  LOCKED_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  NOT_SUBSCRIBED_MESSAGE,
  PASSWORD_NOT_SET_MESSAGE,
  STORE_NOT_MANAGED_MESSAGE,
  STORE_TAB_HINT,
} from "./login-texts";
import {
  normalizeStoreCode,
  STORE_CODE_MAX_LENGTH,
} from "../../shared/session/store-code";
import { useMountedRef } from "./use-mounted-ref";

const STORE_PASSWORD_MAX_LENGTH = 20;
const STORE_CODE_LABEL = "점포코드 (예: ST000001)";
const FIELDS = {
  store: { id: STORE_CODE_LABEL, secret: "매장 프로그램 비밀번호" },
  master: { id: "웨일ERP 아이디 입력", secret: "웨일ERP 비밀번호 입력" },
} as const satisfies Record<AccountType, { id: string; secret: string }>;

/** 오류 → 화면 문구 · 로그 사유. 표에 없는 오류는 네트워크 등 그 밖의 오류다 (스펙 3.4). */
function classify(err: unknown): { reason: LoginFailReason; message: string } {
  if (err instanceof InvalidCredentialsError)
    return {
      reason: "invalid-credentials",
      message: INVALID_CREDENTIALS_MESSAGE,
    };
  if (err instanceof NotSubscribedError)
    return { reason: "not-subscribed", message: NOT_SUBSCRIBED_MESSAGE };
  if (err instanceof StoreNotManagedError)
    return { reason: "store-not-managed", message: STORE_NOT_MANAGED_MESSAGE };
  if (err instanceof PasswordNotSetError)
    return { reason: "password-not-set", message: PASSWORD_NOT_SET_MESSAGE };
  if (err instanceof LoginLockedError)
    return { reason: "locked", message: LOCKED_MESSAGE };
  return { reason: "network", message: NETWORK_ERROR_MESSAGE };
}

interface Props {
  kind: AccountType;
  authApi: AuthApi;
  /** 점포코드는 두 탭이 같이 쓰므로 화면(LoginScreen)이 들고 있어 탭을 바꿔도 남는다 (스펙 3.2-4). */
  storeCode: string;
  onStoreCodeChange(code: string): void;
  /** remember: 자동로그인 체크 여부. 웨일ERP 계정은 항상 false. */
  onLogin(session: Session, remember: boolean): void;
}

const inputClass =
  "h-16 w-full rounded-xl border border-gray-300 px-5 text-xl outline-none focus:border-blue-600";

export function LoginForm({
  kind,
  authApi,
  storeCode,
  onStoreCodeChange,
  onLogin,
}: Props) {
  const isStore = kind === "store";
  // 점포번호 탭은 점포코드가 첫 칸, 웨일ERP 탭은 아이디가 첫 칸이고 점포코드가 마지막 칸이다.
  const [erpId, setErpId] = useState("");
  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useMountedRef();
  const labels = FIELDS[kind];
  // 점포코드는 입력할 때 이미 다듬었다. 웨일ERP 아이디만 여기서 앞뒤 공백을 지우고, 비밀번호는 그대로 둔다.
  const trimmedErpId = erpId.trim();
  const canSubmit =
    storeCode !== "" &&
    secret !== "" &&
    (isStore || trimmedErpId !== "") &&
    !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    let session: Session;
    try {
      const deviceName = await getDeviceName();
      session = isStore
        ? await withTimeout(
            authApi.loginWithStoreCode(storeCode, secret, deviceName),
          )
        : await withTimeout(
            authApi.loginWithMaster(
              trimmedErpId,
              secret,
              storeCode,
              deviceName,
            ),
          );
    } catch (err) {
      const { reason, message } = classify(err);
      logInfo(logMessages.loginFailed(kind, reason));
      if (reason === "network") {
        // 입력값은 남기지 않는다 (스펙 8장). 계정 종류와 오류 요약만 남긴다.
        // 화면이 사라진 뒤 온 실패도 기록은 남긴다.
        console.error("[auth] 로그인 요청 실패", {
          accountType: kind,
          ...errorSummary(err),
        });
      }
      if (mounted.current) setError(message);
      return;
    } finally {
      if (mounted.current) setPending(false);
    }
    // 서버 요청이 성공한 뒤의 처리는 try 밖에 둔다. 여기서 난 오류를 "서버 연결 실패"로 잘못 보이지 않게 한다.
    // 탭을 바꿔 이 폼이 사라진 뒤 온 응답은 쓰지 않는다. 점원이 다른 계정으로 바꾸려던 것이다.
    if (mounted.current) {
      saveLastStoreCode(storeCode);
      onLogin(session, isStore && remember);
    }
  }

  const storeCodeInput = (
    <input
      aria-label={STORE_CODE_LABEL}
      placeholder={STORE_CODE_LABEL}
      value={storeCode}
      maxLength={STORE_CODE_MAX_LENGTH}
      onChange={(e) => {
        onStoreCodeChange(normalizeStoreCode(e.target.value));
        setError(null);
      }}
      autoFocus={isStore}
      className={inputClass}
    />
  );

  return (
    // autoComplete="off": 비밀번호를 WebView가 저장 · 자동완성하지 않게 한다 (스펙 4장).
    <form
      onSubmit={(e) => void submit(e)}
      autoComplete="off"
      className="flex flex-col gap-4"
    >
      {isStore ? (
        storeCodeInput
      ) : (
        <input
          aria-label={labels.id}
          placeholder={labels.id}
          value={erpId}
          onChange={(e) => {
            setErpId(e.target.value);
            setError(null);
          }}
          autoFocus
          className={inputClass}
        />
      )}
      <div className="relative">
        <input
          aria-label={labels.secret}
          placeholder={labels.secret}
          type={showSecret ? "text" : "password"}
          value={secret}
          // 매장 프로그램 비밀번호는 20자까지, 문자 종류는 스펙에 없어 막지 않는다 (스펙 3.1-3). 웨일ERP 비밀번호 길이는 웨일ERP가 정한다.
          maxLength={isStore ? STORE_PASSWORD_MAX_LENGTH : undefined}
          onChange={(e) => {
            setSecret(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          className={`${inputClass} pr-16`}
        />
        <button
          type="button"
          aria-label={showSecret ? "비밀번호 숨기기" : "비밀번호 보기"}
          onClick={() => setShowSecret((v) => !v)}
          className="absolute top-1/2 right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
        >
          {showSecret ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      </div>
      {!isStore && storeCodeInput}
      {isStore && (
        <label className="flex items-center gap-2 text-lg font-bold">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-6"
          />
          자동로그인
        </label>
      )}
      <button
        type="submit"
        disabled={!canSubmit}
        className="h-16 rounded-xl bg-blue-600 text-xl font-bold text-white hover:bg-blue-700 disabled:bg-gray-400"
      >
        로그인
      </button>
      {error && (
        <p role="alert" className="text-lg text-red-600">
          {error}
        </p>
      )}
      {isStore ? (
        <p className="text-base text-gray-600">{STORE_TAB_HINT}</p>
      ) : (
        <p className="text-base text-gray-600">
          {ERP_TAB_HINT}{" "}
          <button
            type="button"
            onClick={() =>
              void openWhaleErp().catch((err: unknown) =>
                console.error("[auth] 웨일ERP 열기 실패", errorSummary(err)),
              )
            }
            // 터치로 누르기 쉽게 누르는 영역을 키운다 (AGENTS 터치 우선).
            className="min-h-12 px-3 font-bold text-blue-600 underline"
          >
            웨일ERP 열기
          </button>
        </p>
      )}
    </form>
  );
}
