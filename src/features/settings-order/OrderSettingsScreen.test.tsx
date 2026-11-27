// 주문설정 화면 (SPEC-settings-order 3 · 4 · 9 · 11장). 탭 연결은 진짜 AppShell과 모의 서버로 돌린다.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import {
  createMockOrderSettingsApi,
  type OrderSettingsApi,
} from "../../shared/api/order-settings";
import { REQUEST_TIMEOUT_MS } from "../../shared/api/with-timeout";
import { OrderSettingsApiContext } from "../../shared/api/order-settings-context";
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
import { OrderSettingsScreen } from "./OrderSettingsScreen";
import { ORDER_SETTINGS_TEXTS as T } from "./order-settings-texts";

vi.mock("@tauri-apps/plugin-log", () => {
  const noop = async () => {};
  return { info: noop, warn: noop, error: noop };
});

const group = (label: string) => screen.getByRole("group", { name: label });
const radio = (label: string, minutes: number) =>
  within(group(label)).getByRole("radio", { name: `${minutes}분` });

function mountShell(
  accountType: Session["accountType"],
  api: ReturnType<typeof createMockOrderSettingsApi>,
) {
  const view = render(
    <AppShellProvider
      windowApi={createFakeWindow().win}
      storeStatusApi={createMockStoreStatusApi({ delayMs: 0 })}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={createMemoryTokenStore()}
      printerApi={createFakePrinterApi()}
      printerSettingsStore={createMemoryPrinterSettingsStore()}
      logApi={createFakeLogApi()}
      initialSession={{
        accountType,
        store: { id: "s1", code: "ST000001", name: "시험 점포" },
        accessToken: "t",
      }}
    >
      <OrderSettingsApiContext.Provider value={api}>
        <AppShell />
      </OrderSettingsApiContext.Provider>
    </AppShellProvider>,
  );
  fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));
  fireEvent.click(screen.getByRole("tab", { name: "주문설정" }));
  return view;
}

describe("주문설정 화면", () => {
  it("두 칸 모두 5~30분 6개 선택지와 기본값(자동 취소 15분 · 도착 최소 5분)을 보인다", async () => {
    render(
      <OrderSettingsScreen
        onSavingChange={() => {}}
        api={createMockOrderSettingsApi({ delayMs: 0 })}
      />,
    );
    await screen.findByText(T.title);
    for (const label of [T.autoCancel.label, T.arrivalMin.label]) {
      expect(
        within(group(label))
          .getAllByRole("radio")
          .map((r) => r.closest("label")?.textContent),
      ).toEqual(["5분", "10분", "15분", "20분", "25분", "30분"]);
    }
    expect(radio(T.autoCancel.label, 15)).toBeChecked();
    expect(radio(T.arrivalMin.label, 5)).toBeChecked();
    expect(screen.getByText(T.autoCancel.note)).toBeInTheDocument();
    expect(screen.getByText(T.arrivalMin.note)).toBeInTheDocument();
  });

  it.each(["store", "master"] as const)(
    "%s 계정도 두 값을 바꿀 수 있고, 다시 열면 서버 값이 보인다",
    async (accountType) => {
      const api = createMockOrderSettingsApi({ delayMs: 0 });
      const save = vi.spyOn(api, "save");
      const view = mountShell(accountType, api);
      await screen.findByText(T.title);
      fireEvent.click(radio(T.autoCancel.label, 5));
      await screen.findByText(T.saved);
      fireEvent.click(radio(T.arrivalMin.label, 30));
      await waitFor(() =>
        expect(save).toHaveBeenLastCalledWith({
          autoCancelMinutes: 5,
          arrivalMinMinutes: 30,
        }),
      );
      await waitFor(() =>
        expect(api.current()).toEqual({
          autoCancelMinutes: 5,
          arrivalMinMinutes: 30,
        }),
      );
      view.unmount();

      mountShell(accountType, api);
      await waitFor(() => expect(radio(T.autoCancel.label, 5)).toBeChecked());
      expect(radio(T.arrivalMin.label, 30)).toBeChecked();
    },
  );

  it("저장에 실패하면 마지막으로 저장된 값으로 되돌리고 안내를 띄운다", async () => {
    let failSave = true;
    const api = createMockOrderSettingsApi({
      delayMs: 0,
      shouldFail: (kind) => kind === "save" && failSave,
    });
    render(<OrderSettingsScreen onSavingChange={() => {}} api={api} />);
    await screen.findByText(T.title);
    fireEvent.click(radio(T.autoCancel.label, 30));
    expect(radio(T.autoCancel.label, 30)).toBeChecked();
    expect(await screen.findByText(T.saveFailed)).toBeInTheDocument();
    expect(radio(T.autoCancel.label, 15)).toBeChecked();
    expect(screen.queryByText(T.saved)).toBeNull();

    // 한 번 저장에 성공한 뒤 실패하면 처음 값이 아니라 성공한 값으로 돌아간다.
    failSave = false;
    fireEvent.click(radio(T.autoCancel.label, 5));
    await screen.findByText(T.saved);
    failSave = true;
    fireEvent.click(radio(T.autoCancel.label, 25));
    await screen.findByText(T.saveFailed);
    expect(radio(T.autoCancel.label, 5)).toBeChecked();
  });

  it("저장이 끝나기 전에는 선택지를 막아 한 번에 하나만 보낸다", async () => {
    const api = createMockOrderSettingsApi({ delayMs: 50 });
    const save = vi.spyOn(api, "save");
    render(<OrderSettingsScreen onSavingChange={() => {}} api={api} />);
    await screen.findByText(T.title, {}, { timeout: 1000 });
    fireEvent.click(radio(T.autoCancel.label, 30));
    expect(radio(T.autoCancel.label, 10)).toBeDisabled();
    expect(radio(T.arrivalMin.label, 10)).toBeDisabled();
    fireEvent.click(radio(T.autoCancel.label, 10));
    expect(save).toHaveBeenCalledTimes(1);
    await screen.findByText(T.saved);
    expect(radio(T.autoCancel.label, 10)).toBeEnabled();
  });

  it("저장이 가는 중에는 메인 탭 · 하위 탭으로 옮기지 않는다", async () => {
    const api = createMockOrderSettingsApi({ delayMs: 50 });
    mountShell("store", api);
    await screen.findByText(T.title, {}, { timeout: 1000 });
    fireEvent.click(radio(T.autoCancel.label, 30));
    fireEvent.click(screen.getByRole("tab", { name: "위젯설정" }));
    fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
    expect(screen.getByRole("tab", { name: "주문설정" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByText(T.saved);
    // 탭 막기는 부모(MainContent)가 화면의 저장 상태를 효과로 받아 풀므로, 풀릴 때까지 다시 누르며 기다린다.
    await waitFor(() => {
      fireEvent.click(screen.getByRole("tab", { name: "위젯설정" }));
      expect(screen.getByRole("tab", { name: "위젯설정" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });

  describe("저장이 시간 초과로 끝나면 (13장 F)", () => {
    // 서버 응답이 오지 않는 저장. stored가 있으면 서버에는 반영된 것으로 본다.
    function timeoutApi(failReload: () => boolean, storeOnServer: boolean) {
      const server = createMockOrderSettingsApi({
        delayMs: 0,
        shouldFail: (kind) => kind === "load" && failReload(),
      });
      const api: OrderSettingsApi = {
        load: () => server.load(),
        save: (settings) => {
          if (storeOnServer) void server.save(settings);
          return new Promise<void>(() => {});
        },
      };
      return api;
    }
    async function tick(ms: number) {
      await act(() => vi.advanceTimersByTimeAsync(ms));
    }

    it("서버에 저장됐으면 안내 뒤 다시 읽어 새 값을 남긴다", async () => {
      vi.useFakeTimers();
      try {
        const api = timeoutApi(() => false, true);
        const load = vi.spyOn(api, "load");
        render(<OrderSettingsScreen onSavingChange={() => {}} api={api} />);
        await tick(0);
        fireEvent.click(radio(T.autoCancel.label, 5));
        await tick(REQUEST_TIMEOUT_MS);
        expect(screen.getByText(T.saveFailed)).toBeInTheDocument();
        // 다시 읽기는 시간 초과 뒤에 시작돼 모의 응답 타이머가 한 번 더 돈다.
        await tick(10);
        expect(load).toHaveBeenCalledTimes(2);
        expect(radio(T.autoCancel.label, 5)).toBeChecked();
        expect(radio(T.autoCancel.label, 10)).toBeEnabled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("다시 읽기도 실패하면 이전 값으로 되돌린다", async () => {
      vi.useFakeTimers();
      try {
        let failReload = false;
        const api = timeoutApi(() => failReload, false);
        const onSavingChange = vi.fn();
        render(
          <OrderSettingsScreen onSavingChange={onSavingChange} api={api} />,
        );
        await tick(0);
        failReload = true;
        fireEvent.click(radio(T.autoCancel.label, 5));
        await tick(REQUEST_TIMEOUT_MS);
        expect(screen.getByText(T.saveFailed)).toBeInTheDocument();
        // 다시 읽는 동안 선택지와 탭 이동이 계속 막혀 있다.
        expect(radio(T.autoCancel.label, 10)).toBeDisabled();
        expect(onSavingChange).toHaveBeenLastCalledWith(true);
        await tick(10);
        expect(radio(T.autoCancel.label, 15)).toBeChecked();
        expect(radio(T.autoCancel.label, 10)).toBeEnabled();
        expect(onSavingChange).toHaveBeenLastCalledWith(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("읽기에 실패하면 안내와 [다시 시도]를 보이고, 누르면 다시 읽는다", async () => {
    let fail = true;
    const api = createMockOrderSettingsApi({
      delayMs: 0,
      shouldFail: () => fail,
    });
    render(<OrderSettingsScreen onSavingChange={() => {}} api={api} />);
    expect(await screen.findByText(T.loadFailed)).toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: T.retry }));
    expect(await screen.findByText(T.title)).toBeInTheDocument();
    expect(radio(T.autoCancel.label, 15)).toBeChecked();
  });
});
