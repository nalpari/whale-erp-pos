// [메뉴품절] 탭 연결 (SPEC-soldout 11장 A) + 요청 · 조회가 엇갈릴 때. 진짜 AppShell과 모의 서버로 돌린다.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockSoldOutApi } from "../../shared/api/soldout";
import { SoldOutApiContext } from "../../shared/api/soldout-context";
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
import { SoldOutScreen } from "./SoldOutScreen";
import { SOLDOUT_TEXTS as T } from "./soldout-texts";

vi.mock("@tauri-apps/plugin-log", () => {
  const noop = async () => {};
  return { info: noop, warn: noop, error: noop };
});

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

describe("[메뉴품절] 탭", () => {
  it("탭을 누를 때마다(같은 탭 다시 누름 포함) 다시 조회한다", async () => {
    const api = createMockSoldOutApi({ delayMs: 0 });
    const spy = vi.spyOn(api, "loadList");
    render(
      <AppShellProvider
        windowApi={createFakeWindow().win}
        storeStatusApi={createMockStoreStatusApi({ delayMs: 0 })}
        authApi={createMockAuthApi({ delayMs: 0 })}
        tokenStore={createMemoryTokenStore()}
        printerApi={createFakePrinterApi()}
        printerSettingsStore={createMemoryPrinterSettingsStore()}
        logApi={createFakeLogApi()}
        initialSession={STORE}
      >
        <SoldOutApiContext.Provider value={api}>
          <AppShell />
        </SoldOutApiContext.Provider>
      </AppShellProvider>,
    );
    const tab = () => screen.getByRole("tab", { name: "메뉴품절" });
    fireEvent.click(tab());
    await screen.findByText(T.guide);
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.click(tab());
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("tab", { name: "매장정보" }));
    fireEvent.click(tab());
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
  });
});

describe("요청 중 탭 이동", () => {
  it("저장 요청이 가는 중에는 다른 메인 탭이 눌리지 않고, 끝나면 이동된다", async () => {
    const api = createMockSoldOutApi({ delayMs: 0 });
    let finish: () => void = () => {};
    vi.spyOn(api, "setMode").mockReturnValue(
      new Promise<void>((r) => (finish = r)),
    );
    render(
      <AppShellProvider
        windowApi={createFakeWindow().win}
        storeStatusApi={createMockStoreStatusApi({ delayMs: 0 })}
        authApi={createMockAuthApi({ delayMs: 0 })}
        tokenStore={createMemoryTokenStore()}
        printerApi={createFakePrinterApi()}
        printerSettingsStore={createMemoryPrinterSettingsStore()}
        logApi={createFakeLogApi()}
        initialSession={STORE}
      >
        <SoldOutApiContext.Provider value={api}>
          <AppShell />
        </SoldOutApiContext.Provider>
      </AppShellProvider>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "메뉴품절" }));
    await screen.findByText(T.guide);
    const group = screen.getByRole("group", { name: "아메리카노 표시방식" });
    fireEvent.click(within(group).getByRole("radio", { name: "숨김" }));
    fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
    // 아무 일 없음: 여전히 메뉴품절 탭이다.
    expect(screen.getByRole("tab", { name: "메뉴품절" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    finish();
    expect(await screen.findByText(T.saved)).toBeInTheDocument();
    // 토스트가 뜬 바로 다음 틱까지는 막힘이 풀리는 중일 수 있어, 풀릴 때까지 눌러 본다.
    await vi.waitFor(() => {
      fireEvent.click(screen.getByRole("tab", { name: "주문내역" }));
      expect(screen.getByRole("tab", { name: "주문내역" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });
});

describe("요청과 조회가 엇갈릴 때", () => {
  it("저장 중에 온 옛 조회 응답이 라디오를 되돌리지 않는다", async () => {
    const api = createMockSoldOutApi({ delayMs: 0 });
    const list = await api.loadList();
    let finish: () => void = () => {};
    vi.spyOn(api, "setMode").mockReturnValue(
      new Promise<void>((r) => (finish = r)),
    );
    const { rerender } = render(
      <SoldOutScreen api={api} refreshSeq={0} onBusyChange={() => {}} />,
    );
    await screen.findByText(T.guide);
    const group = screen.getByRole("group", { name: "아메리카노 표시방식" });
    fireEvent.click(within(group).getByRole("radio", { name: "숨김" }));
    const load = vi.spyOn(api, "loadList").mockResolvedValue(list);
    rerender(
      <SoldOutScreen api={api} refreshSeq={1} onBusyChange={() => {}} />,
    );
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(within(group).getByRole("radio", { name: "숨김" })).toBeChecked();
    finish();
    expect(await screen.findByText(T.saved)).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "숨김" })).toBeChecked();
  });

  it("시간 초과로 저장이 실패하면 되돌리고 서버 값을 다시 읽는다", async () => {
    vi.useFakeTimers();
    try {
      const api = createMockSoldOutApi({ delayMs: 0 });
      vi.spyOn(api, "setMode").mockReturnValue(new Promise(() => {}));
      const load = vi.spyOn(api, "loadList");
      render(
        <SoldOutScreen api={api} refreshSeq={0} onBusyChange={() => {}} />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const group = screen.getByRole("group", { name: "아메리카노 표시방식" });
      fireEvent.click(within(group).getByRole("radio", { name: "숨김" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(screen.getByText(T.saveFailed)).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(2);
      expect(
        within(group).getByRole("radio", { name: "일시품절" }),
      ).toBeChecked();
    } finally {
      vi.useRealTimers();
    }
  });

  it("요청보다 적게 추가되면(다른 곳에서 먼저 등록) 목록을 다시 읽는다", async () => {
    const api = createMockSoldOutApi({ delayMs: 0 });
    const load = vi.spyOn(api, "loadList");
    vi.spyOn(api, "add").mockResolvedValue([]);
    render(<SoldOutScreen api={api} refreshSeq={0} onBusyChange={() => {}} />);
    await screen.findByText(T.guide);
    fireEvent.click(screen.getByRole("button", { name: T.add }));
    const popup = await screen.findByRole("dialog");
    fireEvent.click(
      await within(popup).findByRole("checkbox", { name: "스콘" }),
    );
    fireEvent.click(
      within(popup).getByRole("button", { name: T.popup.submit }),
    );
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it("조회를 보낸 뒤 끝난 삭제가 있으면, 늦게 온 옛 조회 응답으로 줄이 되살아나지 않는다", async () => {
    const api = createMockSoldOutApi({ delayMs: 0 });
    const old = await api.loadList();
    const { rerender } = render(
      <SoldOutScreen api={api} refreshSeq={0} onBusyChange={() => {}} />,
    );
    await screen.findByText(T.guide);
    // 첫 조회는 삭제 전 값을 늦게 돌려주고, 두 번째부터는 서버의 지금 값을 준다.
    let lateReply: (v: typeof old) => void = () => {};
    const load = vi
      .spyOn(api, "loadList")
      .mockReturnValueOnce(new Promise((r) => (lateReply = r)));
    rerender(
      <SoldOutScreen api={api} refreshSeq={1} onBusyChange={() => {}} />,
    );
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "아메리카노 삭제" }));
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() =>
      expect(screen.queryByText("아메리카노")).not.toBeInTheDocument(),
    );
    lateReply(old);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("아메리카노")).not.toBeInTheDocument();
  });
});
