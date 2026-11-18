import { describe, expect, it } from "vitest";
import { formatConsoleArgs, logMessages } from "./log-messages";

const SECRETS = ["01012345678", "S-4821", "master@corp.com", "토큰abc"];

function expectNoSecrets(text: string) {
  for (const s of SECRETS) expect(text).not.toContain(s);
}

describe("logMessages", () => {
  it("로그인 성공 · 실패는 계정 종류와 사유 종류만 남긴다", () => {
    expect(logMessages.loginSucceeded("store")).toBe(
      "로그인 성공: 점포번호 계정",
    );
    expect(logMessages.loginSucceeded("master")).toBe(
      "로그인 성공: 웨일ERP 계정",
    );
    expect(logMessages.loginFailed("master", "invalid-credentials")).toBe(
      "로그인 실패: 웨일ERP 계정, 아이디 · 비밀번호 틀림",
    );
    expect(logMessages.loginFailed("store", "network")).toBe(
      "로그인 실패: 점포번호 계정, 네트워크 등 오류",
    );
  });

  it("개인정보가 인자로 잘못 들어와도 문장에 그대로 찍지 않는다", () => {
    // 타입으로 막혀 있지만, 실행 중 잘못된 값이 와도 표(lookup)에 없으면 unknown으로 둔다.
    const bad = SECRETS[0] as never;
    expectNoSecrets(logMessages.loginSucceeded(bad));
    expectNoSecrets(logMessages.loginFailed(bad, SECRETS[1] as never));
    expectNoSecrets(logMessages.autoLoginResumed(SECRETS[3] as never));
  });

  it("자동 로그인 · 주문받기 · 시험 인쇄 · 설정 문장", () => {
    expect(logMessages.autoLoginResumed("success")).toBe(
      "자동 로그인 재개: 성공",
    );
    expect(logMessages.autoLoginResumed("expired-token-cleared")).toBe(
      "자동 로그인 재개: 토큰 만료로 삭제",
    );
    expect(logMessages.autoLoginResumed("network-token-kept")).toBe(
      "자동 로그인 재개: 네트워크 · 저장소 오류로 토큰 유지",
    );
    expect(logMessages.orderAcceptRequested(true, true)).toBe(
      "주문받기 ON 요청: 성공",
    );
    expect(logMessages.orderAcceptRequested(false, false)).toBe(
      "주문받기 OFF 요청: 실패",
    );
    expect(logMessages.testPrint("Printer A", false)).toBe(
      "시험 인쇄: Printer A, 실패",
    );
    expect(logMessages.settingsFailed("save")).toBe("설정 저장 실패");
    expect(logMessages.settingsFailed("load")).toBe("설정 읽기 실패");
    expect(logMessages.appStarted("0.1.0")).toBe("앱 시작: 0.1.0");
    expect(logMessages.appExited()).toBe("앱 종료");
    expect(logMessages.loggedOut()).toBe("로그아웃");
  });
});

describe("formatConsoleArgs", () => {
  it("문자열은 그대로, 여러 인자는 공백으로 잇는다", () => {
    expect(formatConsoleArgs(["[auth]", "실패"])).toBe("[auth] 실패");
  });

  it("Error는 이름과 문구만 남기고 붙은 요청 본문은 버린다", () => {
    const err = Object.assign(new Error("요청 실패"), {
      config: { data: SECRETS[0] },
    });
    const out = formatConsoleArgs(["[auth]", err]);
    expect(out).toBe("[auth] Error: 요청 실패");
    expectNoSecrets(out);
  });

  it("객체 안에 든 Error도 이름과 문구만 남긴다", () => {
    const err = Object.assign(new Error("실패"), {
      config: { data: SECRETS[0] },
    });
    const out = formatConsoleArgs(["[x]", { stage: "a", error: err }]);
    expect(out).toBe(
      '[x] {"stage":"a","error":{"name":"Error","message":"실패"}}',
    );
    expectNoSecrets(out);
  });

  it("너무 긴 문장은 잘라서 남긴다", () => {
    expect(formatConsoleArgs(["가".repeat(5000)]).length).toBe(2001);
  });

  it("객체는 JSON으로, 순환 참조 같은 변환 실패는 자리표시로 둔다", () => {
    expect(formatConsoleArgs([{ stage: "a" }])).toBe('{"stage":"a"}');
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    // 깊이 제한 덕에 순환 참조도 멈추고, 깊은 곳은 자리표시로 남는다.
    expect(formatConsoleArgs([loop])).toContain("[생략]");
    expect(formatConsoleArgs([1n])).toBe("[변환 불가]");
  });
});
