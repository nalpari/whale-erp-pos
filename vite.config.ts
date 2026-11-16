import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
// @types/node를 추가하지 않기 위해 Tauri 템플릿처럼 타입 오류를 의도적으로 무시한다.
// 나중에 @types/node를 추가하면 이 지시어가 "사용되지 않음" 오류를 내므로 함께 지운다.
// @ts-expect-error @types/node가 없어 node:process 타입을 찾지 못한다
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// 설정 항목 설명: https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],

  // Tauri 템플릿 기본값. 조건 없이 모든 Vite 실행(`pnpm dev` 포함)에 적용된다.
  // 1은 dev · build 모두에, 2 · 3은 개발 서버에만 해당한다.
  // 1. Rust 오류 메시지가 지워지지 않게 화면을 비우지 않는다.
  clearScreen: false,
  // 2. Tauri는 고정 포트(tauri.conf.json의 devUrl)를 기대하므로 포트가 사용 중이면 실패시킨다.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. Rust 쪽 변경으로 화면이 다시 빌드되지 않게 src-tauri는 감시하지 않는다.
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
}));
