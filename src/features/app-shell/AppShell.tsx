// 프로그램 틀: 헤더 + (로그인 전) 로그인 화면 / (로그인 후) 탭 · 콘텐츠 + 확인 팝업.
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";
import { Toast } from "../../shared/ui/Toast";
import { LogViewerScreen } from "../log-viewer/LogViewerScreen";
import { LoginScreen } from "../login/LoginScreen";
import { useOrdersOptional } from "../../shared/orders/orders-context";
import { useAppShell } from "./AppShellContext";
import {
  DIALOG_TEXTS,
  pendingOrdersWarning,
  TOGGLE_ERROR_MESSAGE,
} from "./dialog-texts";
import { Header } from "./Header";
import { MainContent } from "./MainContent";
import { StatusBanners } from "./StatusBanners";

export function AppShell() {
  const { state, actions, authApi, logApi } = useAppShell();
  const pendingOrderCount = useOrdersOptional()?.pendingOrderCount ?? 0;
  const dialogKind = state.dialog;
  const dialog = dialogKind ? DIALOG_TEXTS[dialogKind] : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      {/* 팝업이 떠 있는 동안 뒤 화면은 Tab 키로도 닿지 않게 막는다. */}
      <div inert={dialog !== null} className="flex min-h-0 flex-1 flex-col">
        <Header />
        <StatusBanners />
        <main className="flex min-h-0 flex-1 flex-col">
          {state.logViewerOpen && (
            <LogViewerScreen logApi={logApi} onClose={actions.closeLogViewer} />
          )}
          {/* 로그 화면을 열어도 아래 화면은 숨기기만 한다. 언마운트하면 로그인 입력과 진행 중인 로그인 결과가 사라진다. */}
          <div
            hidden={state.logViewerOpen}
            inert={state.logViewerOpen}
            className={
              state.logViewerOpen ? "hidden" : "flex min-h-0 flex-1 flex-col"
            }
          >
            {state.session ? (
              <MainContent />
            ) : state.restoring ? (
              // 자동 로그인 확인 중: 로그인 폼이 깜빡이지 않게 빈 화면 (스펙 4장).
              <section
                aria-label="로그인"
                aria-busy="true"
                className="flex-1"
              />
            ) : (
              <LoginScreen authApi={authApi} onLogin={actions.login} />
            )}
          </div>
        </main>
      </div>
      {state.toggleError && (
        <Toast
          message={TOGGLE_ERROR_MESSAGE}
          onClose={actions.dismissToggleError}
        />
      )}
      {dialogKind && dialog && (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          warning={pendingOrdersWarning(dialogKind, pendingOrderCount)}
          confirmLabel={dialog.confirmLabel}
          pending={state.dialogPending}
          onConfirm={actions.confirmDialog}
          onCancel={actions.closeDialog}
        />
      )}
    </div>
  );
}
