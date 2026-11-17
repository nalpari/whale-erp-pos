import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
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

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
