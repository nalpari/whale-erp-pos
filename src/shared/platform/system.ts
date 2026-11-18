// 운영체제 정보 · 외부 열기. 실제 일은 Rust 명령이 한다 (src-tauri/src/system.rs).
import { invoke, isTauri } from "@tauri-apps/api/core";
import { errorSummary } from "../error-summary";

/** 컴퓨터 이름. 읽지 못하면 빈 문자열 (스펙 5장). 로그인 요청에만 쓰고 로그에 남기지 않는다. */
export async function getDeviceName(): Promise<string> {
  if (!isTauri()) return "";
  try {
    return await invoke<string>("get_device_name");
  } catch (error) {
    // 빈 값으로 보내면 PC별 잠금이 모든 PC를 한 묶음으로 본다. 명령 미등록 같은 버그를 놓치지 않게 남긴다 (PC 이름 자체는 아님).
    console.error("[system] PC 이름 읽기 실패", errorSummary(error));
    return "";
  }
}

/** 기본 브라우저로 웨일ERP 로그인 화면을 연다. 주소는 Rust 상수라 화면은 넘기지 않는다 (스펙 3.2-3). */
export async function openWhaleErp(): Promise<void> {
  if (!isTauri()) return;
  await invoke("open_whale_erp");
}
