// 모든 테스트에서 toBeInTheDocument 같은 DOM 매처를 쓰기 위해 등록한다.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest globals를 켜지 않아 RTL 자동 정리가 동작하지 않으므로 직접 정리한다.
// 나중에 `test.globals: true`를 켜면 RTL이 자동으로 정리하므로 이 afterEach는 지운다.
afterEach(() => {
  cleanup();
});
