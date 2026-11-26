// [AI챗봇 인기메뉴 설정] 탭 연결 (SPEC-settings-ai-popular 3 · 2장). 진짜 AppShell과 모의 서버로 돌린다.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockPopularApi } from "../../shared/api/popular";
import { PopularApiContext } from "../../shared/api/popular-context";
import { createMockSoldOutApi } from "../../shared/api/soldout";
import { createMockStoreStatusApi } from "../../shared/api/store-status";
import { createFakeLogApi } from "../../shared/log/log-api";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../../shared/printer/printer-api";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import { createFakeWindow } from "../../test/fakes";
import { AppShell } from "../app-shell/AppShell";
import { AppShellProvider } from "../app-shell/AppShellContext";
import { POPULAR_TEXTS as T } from "./popular-texts";

vi.mock("@tauri-apps/plugin-log", () => {
  const noop = async () => {};
  return { info: noop, warn: noop, error: noop };
});

const session = (accountType: Session["accountType"]): Session => ({
  accountType,
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
});

function mount(accountType: Session["accountType"]) {
  const api = createMockPopularApi(createMockSoldOutApi({ delayMs: 0 }), {
    delayMs: 0,
  });
  render(
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={createMockStoreStatusApi({ delayMs: 0 })}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={createMemoryTokenStore()}
      printerApi={createFakePrinterApi()}
      printerSettingsStore={createMemoryPrinterSettingsStore()}
      logApi={createFakeLogApi()}
      initialSession={session(accountType)}
    >
      <PopularApiContext.Provider value={api}>
        <AppShell />
      </PopularApiContext.Provider>
    </AppShellProvider>,
  );
  fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));
  return api;
}
const popularTab = () =>
  screen.getByRole("tab", { name: "AI챗봇 인기메뉴 설정" });

// 탭을 1차 범위에서 숨겨(2026-11-26) 건너뛴다. 탭 연결(MainContent)을 보는 테스트라 화면만 렌더해서는 못 살린다. 탭을 되살릴 때(tabs.ts SETTINGS_TABS 복구) skip을 떼고, AppShell.test의 환경설정 하위 탭 단언도 3개로 되돌린다.
describe.skip("[AI챗봇 인기메뉴 설정] 탭", () => {
  it("탭을 누를 때마다(같은 탭 다시 누름 포함) 다시 조회한다", async () => {
    const api = mount("master");
    const spy = vi.spyOn(api, "loadList");
    fireEvent.click(popularTab());
    await screen.findByText(T.guide);
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.click(popularTab());
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("tab", { name: "위젯설정" }));
    fireEvent.click(popularTab());
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
  });

  it("웨일ERP 계정은 [+ 인기상품 추가]가 켜져 있다", async () => {
    mount("master");
    fireEvent.click(popularTab());
    expect(await screen.findByRole("button", { name: T.add })).toBeEnabled();
  });

  it("점포번호 계정에는 추가 · 삭제가 없다", async () => {
    mount("store");
    fireEvent.click(popularTab());
    expect(await screen.findByText(T.readOnly)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: T.add })).toBeNull();
  });

  it("삭제 요청 중에는 메인 탭 · 하위 탭 이동이 막히고, 끝나면 풀린다", async () => {
    const api = mount("master");
    let finish: () => void = () => {};
    vi.spyOn(api, "remove").mockReturnValue(
      new Promise<void>((r) => (finish = r)),
    );
    fireEvent.click(popularTab());
    fireEvent.click(
      await screen.findByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
    fireEvent.click(screen.getByRole("tab", { name: "위젯설정" }));
    expect(popularTab()).toHaveAttribute("aria-selected", "true");
    await act(async () => finish());
    fireEvent.click(screen.getByRole("tab", { name: "위젯설정" }));
    expect(screen.getByRole("tab", { name: "위젯설정" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("추가 요청 중에도 탭 이동이 막히고, 끝나면 풀린다", async () => {
    const api = mount("master");
    let finish: () => void = () => {};
    vi.spyOn(api, "add").mockReturnValue(
      new Promise((r) => (finish = () => r([]))),
    );
    fireEvent.click(popularTab());
    fireEvent.click(await screen.findByRole("button", { name: T.add }));
    const popup = await screen.findByRole("dialog", { name: T.popup.title });
    fireEvent.click(
      await within(popup).findByRole("checkbox", { name: "카푸치노" }),
    );
    fireEvent.click(
      within(popup).getByRole("button", { name: T.popup.submit }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
    expect(screen.getByRole("tab", { name: "주문내역" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    await act(async () => finish());
    fireEvent.click(within(popup).getByRole("button", { name: T.popup.close }));
    fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
    expect(screen.getByRole("tab", { name: "주문내역" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
