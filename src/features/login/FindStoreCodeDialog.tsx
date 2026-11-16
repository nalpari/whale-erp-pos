// 점포번호 찾기 팝업 (화면정의서 p.10). 성공하면 같은 팝업이 완료 상태로 바뀐다.
import { useEffect, useId, useState, type FormEvent } from "react";
import {
  StoreNotFoundError,
  type AuthApi,
  type FoundStoreCode,
} from "../../shared/api/auth";
import { errorSummary } from "../../shared/error-summary";
import { NETWORK_ERROR_MESSAGE, STORE_NOT_FOUND_LINES } from "./login-texts";
import { useMountedRef } from "./use-mounted-ref";

interface Props {
  authApi: AuthApi;
  onClose(): void;
  /** 완료 상태의 [로그인]. 점포 번호 탭으로 돌아간다. */
  onGoToLogin(): void;
}

const inputClass =
  "h-14 w-full rounded-lg border border-gray-300 px-4 text-lg outline-none focus:border-blue-600";
const buttonClass = "h-16 rounded-xl text-xl font-bold disabled:opacity-50";
const primaryClass = `${buttonClass} bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:opacity-100`;
const secondaryClass = `${buttonClass} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`;

export function FindStoreCodeDialog({ authApi, onClose, onGoToLogin }: Props) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"not-found" | "network" | null>(null);
  const [found, setFound] = useState<FoundStoreCode | null>(null);
  const mounted = useMountedRef();

  // 닫히면 팝업을 열기 전 초점 자리([점포번호 찾기] 버튼)로 돌려놓는다.
  // 입력 칸 autoFocus가 effect보다 먼저 초점을 가져가므로, 첫 렌더에서 미리 기억해 둔다.
  const [previousFocus] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  useEffect(() => () => previousFocus?.focus(), [previousFocus]);

  // 붙여 넣은 앞뒤 공백은 지우고 판단한다 (로그인 폼과 같은 방식).
  const canSubmit = name.trim() !== "" && email.trim() !== "" && !pending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const result = await authApi.findStoreCode(name.trim(), email.trim());
      if (mounted.current) setFound(result);
    } catch (err) {
      const notFound = err instanceof StoreNotFoundError;
      // 대표자 이름 · 이메일은 개인정보라 남기지 않는다. 팝업이 닫힌 뒤 온 실패도 기록은 남긴다.
      if (!notFound) {
        console.error("[auth] 점포번호 찾기 요청 실패", errorSummary(err));
      }
      if (mounted.current) setError(notFound ? "not-found" : "network");
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  return (
    // Escape는 팝업 안에 초점이 있을 때만 닫는다. document에 걸면 위에 뜬 종료 확인 팝업의 Escape에도 같이 닫힌다.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-[32rem] max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-8 shadow-xl"
      >
        <h2 id={titleId} className="text-2xl text-gray-900">
          점포번호 찾기
        </h2>
        <button
          type="button"
          aria-label="팝업 닫기"
          onClick={onClose}
          className="absolute top-6 right-6 flex size-11 items-center justify-center rounded-lg text-3xl text-gray-500 hover:bg-gray-100"
        >
          ×
        </button>

        {found ? (
          <div className="mt-8">
            <h3 className="text-2xl font-bold text-gray-900">
              점포번호 찾기 완료
            </h3>
            <p className="mt-2 text-lg text-gray-600">
              <span className="font-bold text-blue-600">{found.storeName}</span>{" "}
              님의 점포번호 찾기가 완료되었습니다.
            </p>
            <output className="mt-6 block rounded-lg border border-gray-300 px-4 py-4 text-xl">
              {found.maskedStoreCode}
            </output>
            <div className="mt-8 grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={onGoToLogin}
                className={primaryClass}
              >
                로그인
              </button>
              <button
                type="button"
                onClick={onClose}
                className={secondaryClass}
              >
                닫기
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => void submit(e)}
            autoComplete="off"
            // 이메일 형식은 서버가 판정한다. 브라우저 기본 말풍선 대신 화면정의서의 실패 문구를 보이려고 끈다.
            noValidate
            className="mt-6 flex flex-col gap-4"
          >
            <p className="text-lg text-gray-600">
              파트너오피스에 등록된 대표 이메일로 점포번호를 찾을 수 있습니다.
            </p>
            <input
              aria-label="대표자 이름 입력"
              placeholder="대표자 이름 입력"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoFocus
              className={inputClass}
            />
            <input
              aria-label="대표 이메일 입력"
              placeholder="대표 이메일 입력"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              className={inputClass}
            />
            {error && (
              <div role="alert" className="text-base text-red-600">
                {error === "not-found" ? (
                  STORE_NOT_FOUND_LINES.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>{NETWORK_ERROR_MESSAGE}</p>
                )}
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <button
                type="submit"
                disabled={!canSubmit}
                className={primaryClass}
              >
                점포번호 찾기
              </button>
              <button
                type="button"
                onClick={onClose}
                className={secondaryClass}
              >
                취소
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
