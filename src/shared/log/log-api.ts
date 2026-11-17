// "로그 확인" 화면용 (스펙 3.3). 화면은 이 인터페이스만 부르고 Tauri를 직접 부르지 않는다.
// 실제 일은 Rust(src-tauri/src/log_viewer.rs)가 한다. 테스트 · 브라우저에서는 가짜 구현을 쓴다.
import { invoke, isTauri } from "@tauri-apps/api/core";

export interface RecentLogs {
  /** 로그 폴더 경로 */
  path: string;
  /** 현재 로그 파일의 마지막 줄들. 가장 최근 줄이 맨 뒤. 파일이 없으면 빈 배열. */
  lines: string[];
}

export interface LogApi {
  readRecent(lines: number): Promise<RecentLogs>;
  openDir(): Promise<void>;
}

export function createTauriLogApi(): LogApi {
  return {
    readRecent: (lines) => invoke<RecentLogs>("read_recent_logs", { lines }),
    openDir: () => invoke("open_log_dir"),
  };
}

/** 테스트 · 브라우저 개발 모드용 가짜. */
export function createFakeLogApi(
  initial: RecentLogs = {
    path: "(브라우저 모의) /logs",
    lines: ["[2026-11-17][09:00:00][INFO][webview] 앱 시작: 모의"],
  },
): LogApi & { openCount: number } {
  return {
    openCount: 0,
    readRecent: async () => initial,
    async openDir() {
      this.openCount += 1;
    },
  };
}

export function createLogApi(): LogApi {
  return isTauri() ? createTauriLogApi() : createFakeLogApi();
}
