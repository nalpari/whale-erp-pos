// 앱 최상위 화면. 실제 의존성(창 · 서버 API)을 만들어 프로그램 틀에 넘긴다.
import { lazy, Suspense, useState } from "react";
import { AppShell } from "../features/app-shell/AppShell";
import { AppShellProvider } from "../features/app-shell/AppShellContext";
import { createMockAuthApi } from "../shared/api/auth";
import { restoreSession } from "../shared/session/restore-session";
import { createTokenStore } from "../shared/session/token-store";
import { createMockOrderFeed } from "../shared/api/order-feed";
import { createMockOrderBackend } from "../shared/api/orders";
import { OrdersProvider } from "../shared/orders/OrdersProvider";
import { createNoopSoundPlayer } from "../shared/sound/sound-player";
import { createLogApi } from "../shared/log/log-api";
import { createAppWindow } from "../shared/platform/window";
import {
  createPrinterApi,
  createPrinterSettingsStore,
} from "../shared/printer/printer-api";

// 개발 빌드에서만 불러온다. 운영 빌드는 이 조건이 거짓으로 굳어 파일이 통째로 빠진다 (T03 스펙 6장).
const DevMockPanel = import.meta.env.DEV
  ? lazy(() =>
      import("../features/dev-mock/DevMockPanel").then((m) => ({
        default: m.DevMockPanel,
      })),
    )
  : null;

function App() {
  // 렌더마다 새로 만들면 닫기 가로채기가 다시 등록되므로 한 번만 만든다.
  const [windowApi] = useState(createAppWindow);
  // 가정: 백엔드 API가 정해지기 전이라 모의 서버를 쓴다 (SPEC-order-sync 5장). 주문 · 실시간 연결 · 주문받기가 같은 모의 서버를 본다.
  const [backend] = useState(() => createMockOrderBackend());
  const [orderFeed] = useState(() => createMockOrderFeed(backend));
  // 소리 파일은 T06에서 넣는다. 그 전까지는 소리가 나지 않는다.
  const [sound] = useState(createNoopSoundPlayer);
  // 가정: 로그인도 모의 구현을 쓴다 (SPEC-login 5장). 실제 서버를 붙이기 전까지는 설치 파일에서도 시험 계정으로만 로그인된다.
  const [authApi] = useState(() => createMockAuthApi());
  const [tokenStore] = useState(createTokenStore);
  const [printerApi] = useState(createPrinterApi);
  const [printerSettingsStore] = useState(createPrinterSettingsStore);
  const [logApi] = useState(createLogApi);

  return (
    <AppShellProvider
      windowApi={windowApi}
      storeStatusApi={backend.storeStatusApi}
      authApi={authApi}
      tokenStore={tokenStore}
      printerApi={printerApi}
      printerSettingsStore={printerSettingsStore}
      logApi={logApi}
      restoreSession={() => restoreSession(authApi, tokenStore)}
      initialSession={null}
    >
      <OrdersProvider
        orderApi={backend.api}
        orderFeed={orderFeed}
        storeStatusApi={backend.storeStatusApi}
        sound={sound}
      >
        <AppShell />
      </OrdersProvider>
      {DevMockPanel && (
        <Suspense fallback={null}>
          <DevMockPanel dev={backend.dev} />
        </Suspense>
      )}
    </AppShellProvider>
  );
}

export default App;
