// Tauri 안에서 도는 것처럼 꾸며, PC 이름 전달과 [웨일ERP 열기]가 화면 쪽 주소 없이 명령만 부르는지 확인한다.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

import { createMockAuthApi, MOCK_ACCOUNTS } from "../../shared/api/auth";
import { LoginScreen } from "./LoginScreen";

const { store, master } = MOCK_ACCOUNTS;
const PC = "POS-TEST-01";

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) =>
    cmd === "get_device_name" ? PC : undefined,
  );
});

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("PC 이름 (스펙 5장)", () => {
  it("점포번호 탭은 3번째, 웨일ERP 탭은 4번째 인자로 PC 이름을 보내고 로그에 남기지 않는다", async () => {
    const api = createMockAuthApi({ delayMs: 0 });
    const byStore = vi.spyOn(api, "loginWithStoreCode");
    const byErp = vi.spyOn(api, "loginWithMaster");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LoginScreen authApi={api} onLogin={vi.fn()} />);

    type("점포코드 (예: ST000001)", store.storeCode);
    type("매장 프로그램 비밀번호", store.password);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await vi.waitFor(() =>
      expect(byStore).toHaveBeenCalledWith(store.storeCode, store.password, PC),
    );

    fireEvent.click(
      screen.getByRole("tab", { name: "웨일ERP 계정으로 로그인" }),
    );
    type("웨일ERP 아이디 입력", master.masterId);
    type("웨일ERP 비밀번호 입력", master.password);
    type("점포코드 (예: ST000001)", master.storeCode);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));
    await vi.waitFor(() =>
      expect(byErp).toHaveBeenCalledWith(
        master.masterId,
        master.password,
        master.storeCode,
        PC,
      ),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(PC);
    log.mockRestore();
  });

  it("PC 이름 읽기가 실패해도 빈 문자열로 로그인은 진행한다", async () => {
    invoke.mockRejectedValue(new Error("no command"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const api = createMockAuthApi({ delayMs: 0 });
    const byStore = vi.spyOn(api, "loginWithStoreCode");
    render(<LoginScreen authApi={api} onLogin={vi.fn()} />);

    type("점포코드 (예: ST000001)", store.storeCode);
    type("매장 프로그램 비밀번호", store.password);
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await vi.waitFor(() =>
      expect(byStore).toHaveBeenCalledWith(store.storeCode, store.password, ""),
    );
    log.mockRestore();
  });
});

describe("[웨일ERP 열기] (스펙 3.2-3)", () => {
  function openErpTab() {
    render(
      <LoginScreen
        authApi={createMockAuthApi({ delayMs: 0 })}
        onLogin={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("tab", { name: "웨일ERP 계정으로 로그인" }),
    );
  }

  it("주소 없이 명령 이름만 부른다", async () => {
    openErpTab();
    fireEvent.click(screen.getByRole("button", { name: "웨일ERP 열기" }));
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("open_whale_erp"),
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "open_whale_erp",
      expect.anything(),
    );
  });

  it("열기에 실패해도 화면은 그대로이고 오류 요약만 로그에 남는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    invoke.mockRejectedValue(new Error("xdg-open 실행 실패"));
    openErpTab();

    fireEvent.click(screen.getByRole("button", { name: "웨일ERP 열기" }));

    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "로그인" })).toBeInTheDocument();
    log.mockRestore();
  });
});
