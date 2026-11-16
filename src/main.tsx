import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

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
