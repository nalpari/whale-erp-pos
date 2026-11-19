// 헤더 (화면정의서 p.5). Windows 기본 제목 표시줄이 없으므로 헤더가 창 끌기 영역이다 (스펙 2.4).
import { useAppShell } from "./AppShellContext";
import { StoreIcon } from "./Icons";
import { MoreMenu } from "./MoreMenu";
import { OrderAcceptToggle } from "./OrderAcceptToggle";

export function Header() {
  const { state, actions } = useAppShell();
  const { session } = state;

  return (
    // data-tauri-drag-region="deep": 헤더 안 어디를 눌러도 창을 끌어 옮길 수 있다. 두 번 누르면 최대화 ↔ 원래 크기를 바꾼다.
    // 버튼 · 입력칸 · role=switch/menuitem 등 누를 수 있는 요소는 Tauri가 끌기에서 자동으로 뺀다
    // (tauri 2.12.5 src/window/scripts/drag.js). 단 role="menu" 같은 컨테이너는 빠지지 않으니
    // data-tauri-drag-region="false"를 붙인다 (MoreMenu 참고).
    <header
      data-tauri-drag-region="deep"
      className="flex h-16 shrink-0 items-center gap-6 bg-slate-800 px-4 text-white select-none"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg bg-white"
        >
          <img src="/logo-whale.svg" alt="" className="w-6" />
        </span>
        <span className="text-xl font-bold">픽업오더 주문접수</span>
      </div>

      {session && (
        <OrderAcceptToggle
          accepting={state.accepting}
          pending={state.togglePending}
          onRequestChange={actions.requestAccepting}
        />
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-full bg-white text-slate-800">
          <StoreIcon />
        </span>
        <span className="text-lg text-gray-200">
          {session ? session.store.name : "로그인 후 이용해주세요."}
        </span>
      </div>

      <MoreMenu />
    </header>
  );
}
