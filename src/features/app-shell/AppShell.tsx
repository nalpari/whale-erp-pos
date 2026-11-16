// 프로그램 틀: 헤더 + (로그인 전) 로그인 화면 / (로그인 후) 탭 · 콘텐츠 + 확인 팝업.
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { LoginScreen } from "../login/LoginScreen";
import { useAppShell } from "./AppShellContext";
import { DIALOG_TEXTS, TOGGLE_ERROR_MESSAGE } from "./dialog-texts";
import { Header } from "./Header";
import { MainContent } from "./MainContent";

function ToggleErrorNotice() {
  const { actions } = useAppShell();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 bg-red-50 px-6 py-3 text-lg text-red-700"
    >
      <span>{TOGGLE_ERROR_MESSAGE}</span>
      <button
        type="button"
        onClick={actions.dismissToggleError}
        className="h-11 rounded-lg px-4 font-bold hover:bg-red-100"
      >
        닫기
      </button>
    </div>
  );
}

export function AppShell() {
  const { state, actions, authApi } = useAppShell();
  const dialog = state.dialog ? DIALOG_TEXTS[state.dialog] : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* 팝업이 떠 있는 동안 뒤 화면은 Tab 키로도 닿지 않게 막는다. */}
      <div inert={dialog !== null} className="flex min-h-0 flex-1 flex-col">
        <Header />
        {state.toggleError && <ToggleErrorNotice />}
        <main className="flex min-h-0 flex-1 flex-col">
          {state.session ? (
            <MainContent />
          ) : state.restoring ? (
            // 자동 로그인 확인 중: 로그인 폼이 깜빡이지 않게 빈 화면 (스펙 4장).
            <section aria-label="로그인" aria-busy="true" className="flex-1" />
          ) : (
            <LoginScreen authApi={authApi} onLogin={actions.login} />
          )}
        </main>
      </div>
      {dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          pending={state.dialogPending}
          onConfirm={actions.confirmDialog}
          onCancel={actions.closeDialog}
        />
      )}
    </div>
  );
}
