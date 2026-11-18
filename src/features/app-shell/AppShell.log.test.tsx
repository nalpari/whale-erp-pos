// 주요 사건이 앱 흐름에서 실제로 로그로 나가는지, 그 줄에 개인정보가 없는지 확인한다 (SPEC-logging 2.3, 2.4, 7장 4).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockAuthApi,
  MOCK_ACCOUNTS,
  type AuthApi,
} from "../../shared/api/auth";
import { createMockStoreStatusApi } from "../../shared/api/store-status";
import { createFakeLogApi } from "../../shared/log/log-api";
import { installConsoleBridge } from "../../shared/log/log";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../../shared/printer/printer-api";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import { createFakeWindow } from "../../test/fakes";
import { INVALID_CREDENTIALS_MESSAGE } from "../login/login-texts";
import { AppShell } from "./AppShell";
import { AppShellProvider } from "./AppShellContext";

const sent = vi.hoisted(() => ({ lines: [] as string[] }));
vi.mock("@tauri-apps/plugin-log", () => {
  const push = async (m: string) => {
    sent.lines.push(m);
  };
  return { info: push, warn: push, error: push };
});

const { storeCode, password } = MOCK_ACCOUNTS.store;
const SECRETS = [
  storeCode,
  password,
  "mock-refresh-token",
  "mock-access-token",
];

function renderShell(authApi: AuthApi) {
  render(
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={createMockStoreStatusApi({ delayMs: 0 })}
      authApi={authApi}
      tokenStore={createMemoryTokenStore()}
      printerApi={createFakePrinterApi()}
      printerSettingsStore={createMemoryPrinterSettingsStore()}
      logApi={createFakeLogApi()}
      initialSession={null}
    >
      <AppShell />
    </AppShellProvider>,
  );
}

async function submit(code: string, secret: string) {
  fireEvent.change(screen.getByLabelText("점포코드 (예: ST000001)"), {
    target: { value: code },
  });
  fireEvent.change(screen.getByLabelText("매장 프로그램 비밀번호"), {
    target: { value: secret },
  });
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
}

describe("주요 사건 로그", () => {
  let uninstall: () => void;
  beforeEach(() => {
    sent.lines.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    uninstall = installConsoleBridge();
  });
  afterEach(() => {
    uninstall();
    vi.restoreAllMocks();
  });

  function expectNoSecrets() {
    const all = sent.lines.join("\n");
    for (const s of SECRETS) expect(all).not.toContain(s);
  }

  it("로그인 실패 · 성공 · 주문받기 · 로그아웃을 남기고 개인정보는 남기지 않는다", async () => {
    renderShell(createMockAuthApi({ delayMs: 0 }));

    await submit(storeCode, "wrong");
    await screen.findByText(INVALID_CREDENTIALS_MESSAGE);
    expect(sent.lines).toContain(
      "로그인 실패: 점포번호 계정, 아이디 · 비밀번호 틀림",
    );

    await submit(storeCode, password);
    await screen.findByRole("tab", { name: "주문접수" });
    expect(sent.lines).toContain("로그인 성공: 점포번호 계정");

    fireEvent.click(screen.getByRole("switch", { name: "주문 받기" }));
    await vi.waitFor(() =>
      expect(sent.lines).toContain("주문받기 ON 요청: 성공"),
    );

    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "로그아웃",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
    await vi.waitFor(() => expect(sent.lines).toContain("로그아웃"));
    expectNoSecrets();
  });

  it("네트워크 오류에 요청 본문이 붙어 있어도 로그에는 남지 않는다", async () => {
    const leaky = Object.assign(new Error("연결 실패"), {
      config: { data: JSON.stringify({ storeCode, password }) },
    });
    renderShell({
      ...createMockAuthApi({ delayMs: 0 }),
      loginWithStoreCode: async () => {
        throw leaky;
      },
    });

    await submit(storeCode, password);
    await vi.waitFor(() =>
      expect(sent.lines).toContain(
        "로그인 실패: 점포번호 계정, 네트워크 등 오류",
      ),
    );
    expect(sent.lines.some((l) => l.includes("연결 실패"))).toBe(true);
    expectNoSecrets();
  });

  it("로그 화면을 연 채 로그인이 끝나도 [닫기] 전에는 닫히지 않는다", async () => {
    renderShell(createMockAuthApi({ delayMs: 0 }));
    await submit(storeCode, password);
    fireEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.click(
      within(screen.getByRole("menu")).getByRole("menuitem", {
        name: "로그 확인",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "로그 확인" }),
    ).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(sent.lines).toContain("로그인 성공: 점포번호 계정"),
    );
    expect(
      screen.getByRole("heading", { name: "로그 확인" }),
    ).toBeInTheDocument();
  });
});
