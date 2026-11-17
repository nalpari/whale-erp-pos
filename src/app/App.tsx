// 앱 최상위 화면. 실제 의존성(창 · 서버 API)을 만들어 프로그램 틀에 넘긴다.
import { useState } from "react";
import { AppShell } from "../features/app-shell/AppShell";
import { AppShellProvider } from "../features/app-shell/AppShellContext";
import { createMockAuthApi } from "../shared/api/auth";
import { restoreSession } from "../shared/session/restore-session";
import { createTokenStore } from "../shared/session/token-store";
import { createMockStoreStatusApi } from "../shared/api/store-status";
import { createLogApi } from "../shared/log/log-api";
import { createAppWindow } from "../shared/platform/window";
import {
  createPrinterApi,
  createPrinterSettingsStore,
} from "../shared/printer/printer-api";

function App() {
  // 렌더마다 새로 만들면 닫기 가로채기가 다시 등록되므로 한 번만 만든다.
  const [windowApi] = useState(createAppWindow);
  // 가정: 백엔드 API가 정해지기 전이라 모의 구현을 쓴다 (스펙 3장).
  const [storeStatusApi] = useState(() => createMockStoreStatusApi());
  // 가정: 로그인도 모의 구현을 쓴다 (SPEC-login 5장). 실제 서버를 붙이기 전까지는 설치 파일에서도 시험 계정으로만 로그인된다.
  const [authApi] = useState(() => createMockAuthApi());
  const [tokenStore] = useState(createTokenStore);
  const [printerApi] = useState(createPrinterApi);
  const [printerSettingsStore] = useState(createPrinterSettingsStore);
  const [logApi] = useState(createLogApi);

  return (
    <AppShellProvider
      windowApi={windowApi}
      storeStatusApi={storeStatusApi}
      authApi={authApi}
      tokenStore={tokenStore}
      printerApi={printerApi}
      printerSettingsStore={printerSettingsStore}
      logApi={logApi}
      restoreSession={() => restoreSession(authApi, tokenStore)}
      initialSession={null}
    >
      <AppShell />
    </AppShellProvider>
  );
}

export default App;
