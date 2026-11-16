// 아이디 · 비밀번호 입력 폼. 점포 번호 탭과 마스터 탭이 함께 쓴다 (화면정의서 p.8~9).
import { useState, type FormEvent } from "react";
import { errorSummary } from "../../shared/error-summary";
import {
  InvalidCredentialsError,
  type AccountType,
  type AuthApi,
  type Session,
} from "../../shared/api/auth";
import { onlyDigits } from "./digits";
import { EyeIcon, EyeOffIcon } from "./EyeIcons";
import {
  INVALID_CREDENTIALS_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from "./login-texts";
import { useMountedRef } from "./use-mounted-ref";

const FIELDS = {
  store: { id: "점포 고유번호", secret: "대표 휴대폰 번호" },
  master: { id: "마스터 아이디 입력", secret: "마스터 비밀번호 입력" },
} as const satisfies Record<AccountType, { id: string; secret: string }>;

interface Props {
  kind: AccountType;
  authApi: AuthApi;
  /** remember: 자동로그인 체크 여부. 마스터 계정은 항상 false. */
  onLogin(session: Session, remember: boolean): void;
  onFindStoreCode(): void;
}

const inputClass =
  "h-16 w-full rounded-xl border border-gray-300 px-5 text-xl outline-none focus:border-blue-600";

export function LoginForm({ kind, authApi, onLogin, onFindStoreCode }: Props) {
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [remember, setRemember] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useMountedRef();
  const labels = FIELDS[kind];
  const isStore = kind === "store";
  // 붙여 넣은 점포번호 · 아이디 앞뒤 공백 때문에 로그인이 실패하지 않게 아이디만 다듬는다. 비밀번호는 그대로 둔다.
  const trimmedId = id.trim();
  const canSubmit = trimmedId !== "" && secret !== "" && !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    let session: Session;
    try {
      session = isStore
        ? await authApi.loginWithStoreCode(trimmedId, secret)
        : await authApi.loginWithMaster(trimmedId, secret);
    } catch (err) {
      const invalid = err instanceof InvalidCredentialsError;
      if (!invalid) {
        // 아이디 · 비밀번호는 남기지 않는다 (스펙 8장). 계정 종류와 오류 요약만 남긴다.
        // 화면이 사라진 뒤 온 실패도 기록은 남긴다.
        console.error("[auth] 로그인 요청 실패", {
          accountType: kind,
          ...errorSummary(err),
        });
      }
      if (mounted.current) {
        setError(invalid ? INVALID_CREDENTIALS_MESSAGE : NETWORK_ERROR_MESSAGE);
      }
      return;
    } finally {
      if (mounted.current) setPending(false);
    }
    // 서버 요청이 성공한 뒤의 처리는 try 밖에 둔다. 여기서 난 오류를 "서버 연결 실패"로 잘못 보이지 않게 한다.
    // 탭을 바꿔 이 폼이 사라진 뒤 온 응답은 쓰지 않는다. 점원이 다른 계정으로 바꾸려던 것이다.
    if (mounted.current) onLogin(session, isStore && remember);
  }

  return (
    // autoComplete="off": 휴대폰 번호 · 마스터 비밀번호를 WebView가 저장 · 자동완성하지 않게 한다 (스펙 4장).
    <form
      onSubmit={(e) => void submit(e)}
      autoComplete="off"
      className="flex flex-col gap-4"
    >
      <input
        aria-label={labels.id}
        placeholder={labels.id}
        value={id}
        onChange={(e) => {
          setId(e.target.value);
          setError(null);
        }}
        autoFocus
        className={inputClass}
      />
      <div className="relative">
        <input
          aria-label={labels.secret}
          placeholder={labels.secret}
          type={showSecret ? "text" : "password"}
          inputMode={isStore ? "numeric" : undefined}
          value={secret}
          onChange={(e) => {
            // 휴대폰 번호는 숫자만 받는다. 붙여 넣은 하이픈도 여기서 빠진다 (스펙 3.1).
            setSecret(isStore ? onlyDigits(e.target.value) : e.target.value);
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
      {isStore && (
        <div className="flex items-center justify-between text-lg">
          <label className="flex items-center gap-2 font-bold">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-6"
            />
            자동로그인
          </label>
          <button
            type="button"
            onClick={onFindStoreCode}
            className="text-gray-700 underline"
          >
            점포번호 찾기
          </button>
        </div>
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
    </form>
  );
}
