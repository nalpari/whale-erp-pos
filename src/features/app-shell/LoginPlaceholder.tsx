// 로그인 화면 자리. 실제 로그인 화면은 T02가 채운다.
import { useAppShell } from "./AppShellContext";

/** T02 전까지 화면을 바꿔 보기 위한 모의 점포. 실제 점포가 아니다. */
const MOCK_SESSION = { storeName: "모의 점포 (개발용)" };

export function LoginPlaceholder() {
  const { actions } = useAppShell();
  return (
    <section
      aria-label="로그인"
      className="flex flex-1 flex-col items-center justify-center gap-6"
    >
      <p className="text-2xl text-gray-400">로그인 화면 자리 (T02)</p>
      {/* 개발 빌드에서만 보인다. 설치 파일(production 빌드)에는 들어가지 않는다. */}
      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={() => actions.login(MOCK_SESSION)}
          className="h-14 rounded-xl border-2 border-dashed border-orange-400 px-6 text-lg text-orange-600 hover:bg-orange-50"
        >
          개발용 모의 로그인
        </button>
      )}
    </section>
  );
}
