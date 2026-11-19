import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { WidgetApp } from "./features/desktop-widget/WidgetApp";
import {
  createWidgetClient,
  isWidgetWindow,
} from "./features/desktop-widget/widget-host";
import "./index.css";
import {
  installConsoleBridge,
  installGlobalErrorLogging,
  logInfo,
} from "./shared/log/log";
import { logMessages } from "./shared/log/log-messages";

// 화면의 console.warn · error를 로그 파일로도 보낸다. 앱이 끝날 때까지 쓰므로 해제하지 않는다.
installConsoleBridge();
installGlobalErrorLogging();
// 브라우저(pnpm dev)처럼 Tauri가 없으면 버전을 못 읽는다. 그래도 시작 줄은 남긴다.
import("@tauri-apps/api/app")
  .then(({ getVersion }) => getVersion())
  .catch(() => "알 수 없음")
  .then((version) => logInfo(logMessages.appStarted(version)));

const rootElement = document.getElementById("root");
if (!rootElement) {
  // index.html에 #root가 없으면 화면을 그릴 수 없으므로 바로 실패시킨다.
  throw new Error("#root 요소를 찾을 수 없습니다.");
}

// 위젯 창도 같은 화면 파일을 쓴다. 창 이름(label)이 위젯이면 위젯 화면만 그린다 (T06 스펙 4장).
const widget = isWidgetWindow();
if (widget) {
  // 창 크기를 카드에 맞추므로 스크롤바가 생기지 않게 한다.
  document.documentElement.style.overflow = "hidden";
}
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {widget ? <WidgetApp client={createWidgetClient()} /> : <App />}
  </React.StrictMode>,
);
