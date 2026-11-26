import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createMockAuthApi,
  MOCK_ACCOUNTS,
  type Session,
} from "../../shared/api/auth";
import type { StoreStatusApi } from "../../shared/api/store-status";
import { restoreSession as realRestoreSession } from "../../shared/session/restore-session";
import {
  createMemoryTokenStore,
  type TokenStore,
} from "../../shared/session/token-store";
import { createMockStoreStatusApi } from "../../shared/api/store-status";
import type { AppWindow } from "../../shared/platform/window";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../../shared/printer/printer-api";
import {
  createControlledStoreStatusApi,
  createFakeWindow,
} from "../../test/fakes";
import { createFakeLogApi } from "../../shared/log/log-api";
import {
  OrdersContext,
  type OrdersContextValue,
} from "../../shared/orders/orders-context";
import { createNoopSoundPlayer } from "../../shared/sound/sound-player";
import { AppShell } from "./AppShell";
import { AppShellProvider } from "./AppShellContext";
import { appShellReducer, createInitialState } from "./app-shell-state";

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "힘이나는커피생활 종로점" },
  accessToken: "t",
};

function fakeOrders(pendingOrderCount: number): OrdersContextValue {
  return {
    orders: [],
    pendingOrderCount,
    connection: "connected",
    sound: createNoopSoundPlayer(),
    inFlight: {},
    changeStatus: async () => ({ ok: true }),
    remake: async () => ({ ok: false, reason: "not-allowed" }),
    refresh: async () => true,
    pickedUpAt: () => undefined,
    onNewOrder: () => () => {},
    onAccepted: () => () => {},
  };
}

function renderShell(
  options: {
    session?: Session | null;
    windowApi?: AppWindow;
    storeStatusApi?: StoreStatusApi;
    tokenStore?: TokenStore;
    restoreSession?: () => Promise<Session | null>;
    strict?: boolean;
    pendingOrderCount?: number;
  } = {},
) {
  const fakeWindow = createFakeWindow();
  const windowApi = options.windowApi ?? fakeWindow.win;
  const storeStatusApi =
    options.storeStatusApi ?? createMockStoreStatusApi({ delayMs: 0 });
  const tree = (
    <AppShellProvider
      windowApi={windowApi}
      storeStatusApi={storeStatusApi}
      authApi={createMockAuthApi({ delayMs: 0 })}
      tokenStore={options.tokenStore ?? createMemoryTokenStore()}
      printerApi={createFakePrinterApi()}
      printerSettingsStore={createMemoryPrinterSettingsStore()}
      logApi={createFakeLogApi()}
      restoreSession={options.restoreSession}
      initialSession={options.session ?? null}
    >
      {options.pendingOrderCount === undefined ? (
        <AppShell />
      ) : (
        // 확인창 문구만 보는 테스트라 건수만 정해 준다. 실제 목록에서 세는 것은 OrdersProvider 테스트가 본다.
        <OrdersContext.Provider value={fakeOrders(options.pendingOrderCount)}>
          <AppShell />
        </OrdersContext.Provider>
      )}
    </AppShellProvider>
  );
  const { unmount } = render(
    options.strict ? <StrictMode>{tree}</StrictMode> : tree,
  );
  return { fakeWindow, unmount };
}

/** 로그인 화면에서 모의 점포번호 계정으로 로그인한다. */
async function loginWithForm({ remember = false } = {}) {
  const { storeCode, password } = MOCK_ACCOUNTS.store;
  fireEvent.change(screen.getByLabelText("점포코드 (예: ST000001)"), {
    target: { value: storeCode },
  });
  fireEvent.change(screen.getByLabelText("매장 프로그램 비밀번호"), {
    target: { value: password },
  });
  if (remember) {
    fireEvent.click(screen.getByRole("checkbox", { name: "자동로그인" }));
  }
  fireEvent.click(screen.getByRole("button", { name: "로그인" }));
  await screen.findByRole("tab", { name: "주문접수" });
}

function openMoreMenu() {
  fireEvent.click(screen.getByRole("button", { name: "더보기" }));
  return screen.getByRole("menu");
}

function toggle() {
  return screen.getByRole("switch", { name: "주문 받기" });
}

describe("화면 틀 (스펙 2.1)", () => {
  it("로그인 전: 안내 문구만 보이고 토글 · 탭은 숨긴다", () => {
    renderShell();

    expect(screen.getByText("픽업오더 주문접수")).toBeInTheDocument();
    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "더보기" })).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tablist", { name: "메뉴" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "로그인" })).toBeInTheDocument();
  });

  it("로그인 후: 점포명 · 토글 · 탭 5개가 보이고 첫 탭은 주문접수다", () => {
    renderShell({ session: STORE });

    expect(screen.getByText(STORE.store.name)).toBeInTheDocument();
    expect(
      screen.queryByText("로그인 후 이용해주세요."),
    ).not.toBeInTheDocument();
    expect(toggle()).toBeInTheDocument();
    const tabs = within(
      screen.getByRole("tablist", { name: "메뉴" }),
    ).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "주문접수",
      "주문내역",
      "매장정보",
      "메뉴품절",
      "환경설정",
    ]);
    expect(screen.getByRole("tab", { name: "주문접수" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("tabpanel", { name: "주문접수" }),
    ).toBeInTheDocument();
  });

  it("로그인 화면에서 로그인하면 로그인 후 화면으로 바뀐다", async () => {
    renderShell();

    await loginWithForm();

    expect(screen.getByText("모의 점포 (개발용)")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "주문접수" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });

  it("탭 5개 사이를 오갈 수 있다", () => {
    renderShell({ session: STORE });

    for (const name of [
      "주문내역",
      "매장정보",
      "메뉴품절",
      "환경설정",
      "주문접수",
    ]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(screen.getByRole("tab", { name })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tabpanel", { name })).toBeInTheDocument();
    }
  });

  it("환경설정 하위 탭은 위젯설정 · 프린터설정 2개뿐이고 오갈 수 있다", () => {
    renderShell({ session: STORE });
    fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));

    const sub = screen.getByRole("tablist", { name: "환경설정 메뉴" });
    expect(
      within(sub)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["위젯설정", "프린터설정"]);
    // AI챗봇 인기메뉴 설정은 1차 범위에서 숨겼다 (2026-11-26).
    expect(
      within(sub).queryByRole("tab", { name: "AI챗봇 인기메뉴 설정" }),
    ).toBeNull();
    for (const name of ["프린터설정", "위젯설정"]) {
      fireEvent.click(within(sub).getByRole("tab", { name }));
      expect(within(sub).getByRole("tab", { name })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tabpanel", { name })).toBeInTheDocument();
    }
  });

  it("프린터설정 탭에 프린터 칸 3개를 보인다", async () => {
    renderShell({ session: STORE });
    fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));
    fireEvent.click(screen.getByRole("tab", { name: "프린터설정" }));
    const panel = screen.getByRole("tabpanel", { name: "프린터설정" });
    expect(
      await within(panel).findByRole("heading", {
        name: "슬롯 1 — 프린터 없음",
      }),
    ).toBeInTheDocument();
    // 점포번호 계정도 프린터 설정을 바꿀 수 있다 (SPEC-login 2장 권한 표, Q10).
    expect(
      within(panel).getAllByRole("button", { name: "+ 프린터 추가" })[0],
    ).toBeEnabled();
  });

  it("웨일ERP 계정도 프린터설정에서 프린터를 추가할 수 있다", async () => {
    renderShell({ session: { ...STORE, accountType: "master" } });
    fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));
    fireEvent.click(screen.getByRole("tab", { name: "프린터설정" }));
    const panel = screen.getByRole("tabpanel", { name: "프린터설정" });
    await within(panel).findByRole("heading", { name: "슬롯 1 — 프린터 없음" });
    expect(
      within(panel).getAllByRole("button", { name: "+ 프린터 추가" })[0],
    ).toBeEnabled();
  });
});

describe("창 제어 (스펙 2.4, 2.3)", () => {
  it("헤더는 끌기 영역이고, 버튼 · 토글은 Tauri 규칙상 끌기에서 빠진다", () => {
    renderShell({ session: STORE });

    // "deep": 헤더 안 어디를 눌러도 끌기. 버튼 · role=switch · menuitem은 Tauri가 자동으로 뺀다.
    expect(screen.getByRole("banner")).toHaveAttribute(
      "data-tauri-drag-region",
      "deep",
    );
    expect(toggle().tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "더보기" }).tagName).toBe(
      "BUTTON",
    );
  });

  it.each([
    ["창 최소화", "minimize", false],
    ["창 줄이기", "restoreDefaultSize", true],
    ["창 늘리기", "maximize", false],
  ] as const)(
    "%s → 창 감싸기의 %s를 부르고 메뉴를 닫는다",
    async (label, fn, maximized) => {
      const { fakeWindow } = renderShell();
      await act(async () => {}); // 창 상태 구독이 끝나기를 기다린다
      if (maximized) await act(async () => fakeWindow.setMaximized(true));

      fireEvent.click(
        within(openMoreMenu()).getByRole("menuitem", { name: label }),
      );

      expect(fakeWindow.win[fn]).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    },
  );

  it("창 늘리기 / 창 줄이기는 지금 상태에 따라 하나만 보인다", async () => {
    const { fakeWindow } = renderShell();
    await act(async () => {});
    openMoreMenu();
    const names = () =>
      screen.getAllByRole("menuitem").map((m) => m.textContent);

    expect(names()).toContain("창 늘리기");
    expect(names()).not.toContain("창 줄이기");
    await act(async () => fakeWindow.setMaximized(true));
    expect(names()).toContain("창 줄이기");
    expect(names()).not.toContain("창 늘리기");
  });

  it("시작할 때 이미 최대화 상태면 창 줄이기가 보인다", async () => {
    const fakeWindow = createFakeWindow();
    fakeWindow.setMaximized(true);
    renderShell({ windowApi: fakeWindow.win });
    await act(async () => {});

    expect(
      within(openMoreMenu()).getByRole("menuitem", { name: "창 줄이기" }),
    ).toBeInTheDocument();
  });

  it("프로그램을 켜면 마지막 창 크기 · 위치를 되살리고, 화면이 내려가면 멈춘다", async () => {
    const stop = vi.fn();
    const fakeWindow = createFakeWindow();
    fakeWindow.win.manageBounds.mockResolvedValue(stop);
    const { unmount } = renderShell({ windowApi: fakeWindow.win });
    await act(async () => {});

    expect(fakeWindow.win.manageBounds).toHaveBeenCalledTimes(1);
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("프로그램 종료 메뉴 칸 아이콘은 빨간색이다", () => {
    renderShell();
    const menu = openMoreMenu();

    const icon = (name: string) =>
      within(menu).getByRole("menuitem", { name }).querySelector("span");
    expect(icon("프로그램 종료")).toHaveClass("text-red-500");
    expect(icon("창 최소화")).not.toHaveClass("text-red-500");
  });

  it("더보기 메뉴는 끌기 영역에서 빠진다 (버튼 사이 여백을 눌러도 창이 끌리지 않게)", () => {
    renderShell();

    expect(openMoreMenu()).toHaveAttribute("data-tauri-drag-region", "false");
  });

  it("더보기 메뉴를 열면 첫 항목에 초점이 가고, Escape로 닫으면 ⋮ 버튼으로 돌아온다", () => {
    renderShell();
    const menu = openMoreMenu();
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("button", { name: "더보기" })).toHaveFocus();
  });

  it("더보기 메뉴는 Escape로 닫힌다", () => {
    renderShell();
    openMoreMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("더보기 메뉴는 바깥을 누르면 닫힌다", () => {
    renderShell();
    openMoreMenu();

    fireEvent.mouseDown(screen.getByText("픽업오더 주문접수"));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("주문받기 토글 (스펙 2.2)", () => {
  it("로그인 직후 OFF이고, OFF → ON은 확인 없이 성공 뒤에 바뀐다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    expect(toggle()).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle());

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(server.api.setAcceptingOrders).toHaveBeenCalledWith(true);
    // 서버 응답 전에는 바뀌지 않는다
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    await act(async () => server.last().resolve());
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(toggle()).toHaveTextContent("ON");
  });

  it("요청 중에는 다시 누를 수 없다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });

    fireEvent.click(toggle());
    expect(toggle()).toBeDisabled();
    fireEvent.click(toggle());

    expect(server.api.setAcceptingOrders).toHaveBeenCalledTimes(1);
    await act(async () => server.last().resolve());
    expect(toggle()).toBeEnabled();
  });

  it("팝업이 열려 있는 동안 뒤 화면은 inert로 막힌다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    fireEvent.click(toggle());
    await act(async () => server.last().resolve());

    fireEvent.click(toggle());

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(document.querySelector("[inert]")).toContainElement(
      document.querySelector("header"),
    );
  });

  it("요청이 실패하면 원래 상태로 남고 오류 안내를 띄운다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });

    fireEvent.click(toggle());
    await act(async () => server.last().reject(new Error("x")));

    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(toggle()).toBeEnabled();
    // 공용 Toast (Q51 ②)
    expect(screen.getByRole("status")).toHaveTextContent(
      "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  });

  async function turnOn(
    server: ReturnType<typeof createControlledStoreStatusApi>,
  ) {
    fireEvent.click(toggle());
    await act(async () => server.last().resolve());
  }

  it("ON → OFF는 화면정의서 문구의 확인 팝업을 띄운다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    await turnOn(server);

    fireEvent.click(toggle());

    const dialog = screen.getByRole("alertdialog", {
      name: "주문수신을 중단하시겠습니까?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "주문 수신이 중단되면 고객은 앱에서 주문을 할 수 없습니다.",
    );
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["취소", "주문 중단"]);
    expect(server.api.setAcceptingOrders).toHaveBeenCalledTimes(1);
  });

  it("팝업을 열면 초점은 [취소]에 있고, 닫으면 토글로 돌아온다 (Enter 실수 방지)", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    await turnOn(server);
    toggle().focus();

    fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(toggle()).toHaveFocus();
  });

  it("팝업에서 Escape를 누르면 요청 없이 닫힌다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    await turnOn(server);

    fireEvent.click(toggle());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(server.api.setAcceptingOrders).toHaveBeenCalledTimes(1);
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("[취소]면 요청 없이 ON으로 남는다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    await turnOn(server);

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(server.api.setAcceptingOrders).toHaveBeenCalledTimes(1);
    expect(toggle()).toHaveAttribute("aria-checked", "true");
  });

  it("[주문 중단]이면 OFF 요청이 성공한 뒤에 OFF가 된다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    await turnOn(server);

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "주문 중단" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(server.api.setAcceptingOrders).toHaveBeenLastCalledWith(false);
    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(toggle()).toBeDisabled();
    await act(async () => server.last().resolve());
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });

  it("OFF 요청이 실패하면 ON으로 남고 오류 안내를 띄운다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    await turnOn(server);

    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "주문 중단" }));
    await act(async () => server.last().reject(new Error("x")));

    expect(toggle()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
    );
  });
});

describe("로그아웃 (스펙 2.3)", () => {
  it("로그인 전에는 로그아웃 버튼이 없다", () => {
    renderShell();

    const menu = openMoreMenu();
    expect(
      within(menu).queryByRole("menuitem", { name: "로그아웃" }),
    ).toBeNull();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual([
      "다시시작",
      "프로그램 종료",
      "창 최소화",
      "창 늘리기",
      "로그 확인",
    ]);
  });

  it("로그인 후 메뉴는 스펙 2.4 순서의 6칸이고 새로고침은 없다", () => {
    renderShell({ session: STORE });

    const menu = openMoreMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual([
      "다시시작",
      "로그아웃",
      "프로그램 종료",
      "창 최소화",
      "창 늘리기",
      "로그 확인",
    ]);
    expect(
      within(menu).queryByRole("menuitem", { name: "새로고침" }),
    ).toBeNull();
  });

  it("화면정의서 문구의 팝업을 띄우고, [취소]면 그대로 둔다", () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );

    const dialog = screen.getByRole("alertdialog", {
      name: "로그아웃 하시겠습니까?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "주문 수신이 자동으로 중단됩니다.",
    );
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["취소", "로그아웃"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(server.api.setAcceptingOrders).not.toHaveBeenCalled();
    expect(screen.getByText(STORE.store.name)).toBeInTheDocument();
  });

  it("[로그아웃]이면 주문 중단 요청을 보낸 뒤 로그인 화면으로 간다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "로그아웃" }));

    expect(server.api.setAcceptingOrders).toHaveBeenCalledWith(false);
    // 요청 중에는 팝업 버튼을 다시 누를 수 없다
    expect(
      within(dialog).getByRole("button", { name: "로그아웃" }),
    ).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
    await act(async () => server.last().resolve());

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "로그인" })).toBeInTheDocument();
  });

  it("로그아웃 팝업도 초점이 [취소]에 있고, 처리 중에는 Escape로 닫히지 않는다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByRole("button", { name: "취소" })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole("button", { name: "로그아웃" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await act(async () => server.last().resolve());
    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
  });

  it("ON 요청이 가는 중이면 그 요청이 끝난 뒤에 주문 중단을 보낸다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    fireEvent.click(toggle()); // ON 요청, 아직 응답 없음

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
    expect(server.calls.map((c) => c.accepting)).toEqual([true]);

    await act(async () => server.calls[0].resolve());
    expect(server.calls.map((c) => c.accepting)).toEqual([true, false]);
    await act(async () => server.last().resolve());

    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
    await loginWithForm();
    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(toggle()).toBeEnabled();
  });

  it("주문 중단 요청이 실패해도 로그아웃한다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
    await act(async () => server.last().reject(new Error("x")));

    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
  });

  it("다시 로그인하면 토글은 OFF, 탭은 주문접수로 시작한다", async () => {
    const server = createControlledStoreStatusApi();
    renderShell({ session: STORE, storeStatusApi: server.api });
    fireEvent.click(toggle());
    await act(async () => server.last().resolve());
    fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
    await act(async () => server.last().resolve());
    await loginWithForm();

    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("tab", { name: "주문접수" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("프로그램 종료 (스펙 2.3, 2.4)", () => {
  function clickShutdown() {
    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "프로그램 종료" }),
    );
  }

  it("화면정의서 문구의 팝업을 띄우고, [취소]면 끝내지 않는다", () => {
    const { fakeWindow } = renderShell({ session: STORE });

    clickShutdown();

    const dialog = screen.getByRole("alertdialog", {
      name: "프로그램을 종료하시겠습니까?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "주문 수신이 자동으로 중단됩니다.",
    );
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["취소", "프로그램 종료"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(fakeWindow.win.exit).not.toHaveBeenCalled();
  });

  it("[프로그램 종료]면 주문 중단 요청 뒤 로그아웃하고 프로그램을 끝낸다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({
      session: STORE,
      storeStatusApi: server.api,
    });

    clickShutdown();
    fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));

    expect(server.api.setAcceptingOrders).toHaveBeenCalledWith(false);
    expect(fakeWindow.win.exit).not.toHaveBeenCalled();
    await act(async () => server.last().resolve());

    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
  });

  it("ON 요청이 가는 중이면 그 요청이 끝난 뒤에 주문 중단을 보내고 끝낸다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({
      session: STORE,
      storeStatusApi: server.api,
    });
    fireEvent.click(toggle());

    clickShutdown();
    fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    expect(server.calls.map((c) => c.accepting)).toEqual([true]);
    await act(async () => server.calls[0].resolve());
    expect(server.calls.map((c) => c.accepting)).toEqual([true, false]);
    expect(fakeWindow.win.exit).not.toHaveBeenCalled();
    await act(async () => server.last().resolve());

    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
  });

  it("프로그램 종료 팝업도 초점이 [취소]에 있다", () => {
    renderShell({ session: STORE });

    clickShutdown();

    expect(screen.getByRole("button", { name: "취소" })).toHaveFocus();
  });

  it("주문 중단 요청이 실패해도 끝낸다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({
      session: STORE,
      storeStatusApi: server.api,
    });

    clickShutdown();
    fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    await act(async () => server.last().reject(new Error("x")));

    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
  });

  it("로그인 전에도 같은 팝업을 띄우고, 확인하면 요청 없이 끝낸다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({ storeStatusApi: server.api });

    clickShutdown();
    expect(
      screen.getByRole("alertdialog", { name: "프로그램을 종료하시겠습니까?" }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    });

    expect(server.api.setAcceptingOrders).not.toHaveBeenCalled();
    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
  });

  it("종료 처리 중에는 팝업이 그대로 잠겨 있고 Alt+F4로 다시 열리지 않는다", async () => {
    const server = createControlledStoreStatusApi();
    const fakeWindow = createFakeWindow();
    let finishExit: () => void = () => {};
    fakeWindow.win.exit.mockImplementation(
      () => new Promise<void>((resolve) => (finishExit = resolve)),
    );
    renderShell({
      session: STORE,
      storeStatusApi: server.api,
      windowApi: fakeWindow.win,
    });

    clickShutdown();
    fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    act(() => {
      fakeWindow.requestClose();
    });
    await act(async () => server.last().resolve());

    // 로그아웃은 됐지만 종료가 끝날 때까지 팝업은 처리 중으로 남는다
    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("alertdialog", {
      name: "프로그램을 종료하시겠습니까?",
    });
    expect(
      within(dialog).getByRole("button", { name: "프로그램 종료" }),
    ).toBeDisabled();
    act(() => {
      fakeWindow.requestClose();
    });
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    await act(async () => finishExit());
  });

  it("종료가 실패하면 팝업을 닫아 다시 시도할 수 있게 한다", async () => {
    const fakeWindow = createFakeWindow();
    fakeWindow.win.exit.mockRejectedValueOnce(new Error("권한 없음"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShell({ windowApi: fakeWindow.win });

    clickShutdown();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    clickShutdown();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    });
    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("로그인 상태에서 종료가 실패하면 로그아웃된 채 팝업이 닫히고 다시 종료할 수 있다", async () => {
    const server = createControlledStoreStatusApi();
    const fakeWindow = createFakeWindow();
    fakeWindow.win.exit.mockRejectedValueOnce(new Error("권한 없음"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShell({
      session: STORE,
      storeStatusApi: server.api,
      windowApi: fakeWindow.win,
    });

    clickShutdown();
    fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    await act(async () => server.last().resolve());

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
    clickShutdown();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "프로그램 종료" }));
    });
    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it("화면이 내려가면 닫기 가로채기를 해제한다", async () => {
    const { fakeWindow, unmount } = renderShell();
    await act(async () => {});

    unmount();

    expect(fakeWindow.requestClose()).toBe(false);
  });

  it("운영체제 닫기(Alt+F4)를 받으면 프로그램 종료 팝업을 띄운다", () => {
    const { fakeWindow } = renderShell({ session: STORE });

    act(() => {
      expect(fakeWindow.requestClose()).toBe(true);
    });

    expect(
      screen.getByRole("alertdialog", { name: "프로그램을 종료하시겠습니까?" }),
    ).toBeInTheDocument();
    expect(fakeWindow.win.exit).not.toHaveBeenCalled();
  });
});

describe("자동 로그인 저장 (스펙 3.4, 4장)", () => {
  /** 저장 · 삭제 호출을 기록하는 메모리 저장소. */
  function spyStore(initial: string | null = null) {
    const store = createMemoryTokenStore(initial);
    vi.spyOn(store, "save");
    vi.spyOn(store, "clear");
    return store;
  }

  function logout() {
    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
  }

  it("자동로그인을 체크하고 로그인하면 재발급 토큰만 저장한다 (비밀번호는 저장 안 함)", async () => {
    const tokenStore = spyStore();
    renderShell({ tokenStore });

    await loginWithForm({ remember: true });

    await vi.waitFor(() => expect(tokenStore.save).toHaveBeenCalledTimes(1));
    const saved = await tokenStore.load();
    expect(saved).toBe("mock-refresh-token");
    expect(saved).not.toContain(MOCK_ACCOUNTS.store.password);
  });

  it("체크하지 않고 로그인하면 저장하지 않고, 남아 있던 토큰도 지운다", async () => {
    const tokenStore = spyStore("old-token");
    renderShell({ tokenStore });

    await loginWithForm();

    await vi.waitFor(() => expect(tokenStore.clear).toHaveBeenCalled());
    expect(tokenStore.save).not.toHaveBeenCalled();
    expect(await tokenStore.load()).toBeNull();
  });

  it("로그아웃하면 토큰을 지운다", async () => {
    const tokenStore = spyStore("saved-token");
    renderShell({ session: STORE, tokenStore });

    logout();

    await screen.findByText("로그인 후 이용해주세요.");
    await vi.waitFor(async () => expect(await tokenStore.load()).toBeNull());
  });

  it("프로그램 종료는 토큰을 지우지 않는다 (다음 실행 때 자동 로그인)", async () => {
    const tokenStore = spyStore("saved-token");
    const { fakeWindow } = renderShell({ session: STORE, tokenStore });

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "프로그램 종료" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "프로그램 종료",
      }),
    );

    await vi.waitFor(() => expect(fakeWindow.win.exit).toHaveBeenCalled());
    expect(tokenStore.clear).not.toHaveBeenCalled();
    expect(await tokenStore.load()).toBe("saved-token");
  });

  it("토큰 저장이 실패해도 로그인은 그대로 된다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const tokenStore = createMemoryTokenStore();
    vi.spyOn(tokenStore, "save").mockRejectedValue(new Error("x"));
    renderShell({ tokenStore });

    await loginWithForm({ remember: true });

    expect(screen.getByRole("tab", { name: "주문접수" })).toBeInTheDocument();
    await vi.waitFor(() => expect(log).toHaveBeenCalled());
    expect(JSON.stringify(log.mock.calls)).not.toContain("mock-refresh-token");
    log.mockRestore();
  });
});

describe("시작 시 자동 로그인 (스펙 4장)", () => {
  it("확인하는 동안 로그인 폼 대신 빈 화면, 헤더는 그대로", async () => {
    let finish: (session: Session | null) => void = () => {};
    renderShell({
      restoreSession: () => new Promise((resolve) => (finish = resolve)),
    });

    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("점포코드 (예: ST000001)"),
    ).not.toBeInTheDocument();
    await act(async () => finish(STORE));

    expect(screen.getByText(STORE.store.name)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "주문접수" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("확인에 실패(null)하면 로그인 화면을 보인다", async () => {
    renderShell({ restoreSession: async () => null });

    expect(
      await screen.findByLabelText("점포코드 (예: ST000001)"),
    ).toBeInTheDocument();
  });

  it("확인이 거절돼도 빈 화면에 갇히지 않고 로그인 화면을 보인다", async () => {
    renderShell({ restoreSession: () => Promise.reject(new Error("x")) });

    expect(
      await screen.findByLabelText("점포코드 (예: ST000001)"),
    ).toBeInTheDocument();
  });

  it("확인 중에 Alt+F4로 연 종료 팝업은 확인이 끝나도 그대로 남는다", async () => {
    let finish: (session: Session | null) => void = () => {};
    const { fakeWindow } = renderShell({
      restoreSession: () => new Promise((resolve) => (finish = resolve)),
    });
    await act(async () => {}); // 닫기 가로채기 등록을 기다린다
    act(() => {
      expect(fakeWindow.requestClose()).toBe(true);
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await act(async () => finish(STORE));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(STORE.store.name)).toBeInTheDocument();
  });
});

describe("appShellReducer restore-finished", () => {
  it("확인이 끝난 뒤 늦게 온 결과는 버린다", () => {
    const state = createInitialState(null);
    expect(
      appShellReducer(state, { type: "restore-finished", session: STORE }),
    ).toBe(state);
  });
});

describe("자동 로그인 전체 흐름 (스펙 9장 4)", () => {
  it("개발 모드 StrictMode에서도 시작 확인 요청은 한 번만 보낸다", async () => {
    const restoreSession = vi.fn(async () => STORE);
    renderShell({ restoreSession, strict: true });

    expect(await screen.findByText(STORE.store.name)).toBeInTheDocument();
    expect(restoreSession).toHaveBeenCalledTimes(1);
  });

  it("체크하고 로그인 → 재실행하면 로그인 화면을 건너뛰고, 로그아웃 뒤 재실행하면 로그인 화면", async () => {
    const authApi = createMockAuthApi({ delayMs: 0 });
    const tokenStore = createMemoryTokenStore();
    const restore = () => realRestoreSession(authApi, tokenStore);

    const first = renderShell({ tokenStore });
    await loginWithForm({ remember: true });
    await vi.waitFor(async () =>
      expect(await tokenStore.load()).not.toBeNull(),
    );
    first.unmount();

    const second = renderShell({ tokenStore, restoreSession: restore });
    expect(await screen.findByText("모의 점포 (개발용)")).toBeInTheDocument();
    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그아웃" }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "로그아웃",
      }),
    );
    await vi.waitFor(async () => expect(await tokenStore.load()).toBeNull());
    second.unmount();

    renderShell({ tokenStore, restoreSession: restore });
    expect(
      await screen.findByLabelText("점포코드 (예: ST000001)"),
    ).toBeInTheDocument();
  });

  it("마스터 계정으로 로그인하면 남아 있던 점포 토큰을 지운다", async () => {
    const tokenStore = createMemoryTokenStore("old-token");
    renderShell({ tokenStore });

    fireEvent.click(
      screen.getByRole("tab", { name: "웨일ERP 계정으로 로그인" }),
    );
    fireEvent.change(screen.getByLabelText("웨일ERP 아이디 입력"), {
      target: { value: MOCK_ACCOUNTS.master.masterId },
    });
    fireEvent.change(screen.getByLabelText("웨일ERP 비밀번호 입력"), {
      target: { value: MOCK_ACCOUNTS.master.password },
    });
    fireEvent.change(screen.getByLabelText("점포코드 (예: ST000001)"), {
      target: { value: MOCK_ACCOUNTS.master.storeCode },
    });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    await screen.findByRole("tab", { name: "주문접수" });
    await vi.waitFor(async () => expect(await tokenStore.load()).toBeNull());
  });

  it("토큰 저장이 실패하면 이전 토큰을 지운다 (다른 점포로 자동 로그인 방지)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tokenStore = createMemoryTokenStore("other-store-token");
    vi.spyOn(tokenStore, "save").mockRejectedValue(new Error("x"));
    renderShell({ tokenStore });

    await loginWithForm({ remember: true });

    await vi.waitFor(async () => expect(await tokenStore.load()).toBeNull());
    vi.mocked(console.error).mockRestore();
  });
});

describe("로그 확인 (SPEC-logging 3.1)", () => {
  const MASTER: Session = {
    accountType: "master",
    store: { id: "s2", code: "ST000002", name: "본사" },
    accessToken: "t",
  };

  async function openLogViewer() {
    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "로그 확인" }),
    );
    await screen.findByRole("heading", { name: "로그 확인" });
  }

  it("로그인 전에도 더보기 메뉴에서 열고, 닫으면 로그인 화면으로 돌아온다", async () => {
    renderShell();
    await openLogViewer();
    expect(screen.getByLabelText("점포코드 (예: ST000001)")).not.toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(
      screen.getByLabelText("점포코드 (예: ST000001)"),
    ).toBeInTheDocument();
  });

  it("로그인 전에 열었다 닫아도 입력한 값이 남는다", async () => {
    renderShell();
    fireEvent.change(screen.getByLabelText("점포코드 (예: ST000001)"), {
      target: { value: "S-1" },
    });

    await openLogViewer();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.getByLabelText("점포코드 (예: ST000001)")).toHaveValue("S-1");
  });

  it.each([
    ["점포번호", STORE],
    ["마스터", MASTER],
  ])("%s 계정: 열고 닫으면 탭 화면으로 돌아온다", async (_name, session) => {
    renderShell({ session });
    await openLogViewer();
    expect(
      screen.queryByRole("tab", { name: "주문접수" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.getByRole("tab", { name: "주문접수" })).toBeInTheDocument();
  });
});

describe("처리할 주문 경고 (스펙 2.3, Q04)", () => {
  const WARN_OFF =
    "처리할 주문이 3건 있습니다. 주문받기를 꺼도 이 주문은 처리해야 합니다.";
  const WARN_RESTART =
    "처리할 주문이 3건 있습니다. 다시 켜도 이 주문은 그대로 처리할 수 있습니다.";
  const WARN_END =
    "처리할 주문이 3건 있습니다. 프로그램을 끄면 이 주문을 처리하거나 고객에게 알림을 보낼 수 없습니다.";

  async function openOffDialog() {
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(toggle()).toHaveAttribute("aria-checked", "true"),
    );
    fireEvent.click(toggle());
  }

  it.each([
    [
      "다시시작",
      "다시시작하시겠습니까?",
      "다시 켜면 주문받기가 꺼집니다.",
      WARN_RESTART,
    ],
    [
      "로그아웃",
      "로그아웃 하시겠습니까?",
      "주문 수신이 자동으로 중단됩니다.",
      WARN_END,
    ],
    [
      "프로그램 종료",
      "프로그램을 종료하시겠습니까?",
      "주문 수신이 자동으로 중단됩니다.",
      WARN_END,
    ],
  ])(
    "%s 확인창: 3건이면 원래 문구에 경고 줄이 붙는다",
    (menu, title, message, warning) => {
      renderShell({ session: STORE, pendingOrderCount: 3 });
      fireEvent.click(
        within(openMoreMenu()).getByRole("menuitem", { name: menu }),
      );
      const dialog = screen.getByRole("alertdialog", { name: title });
      expect(within(dialog).getByText(message)).toBeInTheDocument();
      expect(within(dialog).getByText(warning)).toBeInTheDocument();
    },
  );

  it.each([
    ["다시시작", "다시시작하시겠습니까?"],
    ["로그아웃", "로그아웃 하시겠습니까?"],
    ["프로그램 종료", "프로그램을 종료하시겠습니까?"],
  ])("%s 확인창: 0건이면 경고 줄이 없다", (menu, title) => {
    renderShell({ session: STORE, pendingOrderCount: 0 });
    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: menu }),
    );

    const dialog = screen.getByRole("alertdialog", { name: title });
    expect(within(dialog).queryByText(/처리할 주문이/)).toBeNull();
  });

  it("주문받기 OFF 확인창에도 경고 줄이 붙는다", async () => {
    renderShell({ session: STORE, pendingOrderCount: 3 });
    await openOffDialog();

    expect(screen.getByText(WARN_OFF)).toBeInTheDocument();
  });

  it("주문받기 OFF 확인창: 0건이면 줄이 없다", async () => {
    renderShell({ session: STORE });
    await openOffDialog();

    expect(screen.queryByText(/처리할 주문이/)).toBeNull();
  });

  it("Alt+F4(닫기 요청)도 같은 확인창에 경고 줄이 붙는다", () => {
    const { fakeWindow } = renderShell({
      session: STORE,
      pendingOrderCount: 3,
    });

    act(() => void fakeWindow.requestClose());

    expect(screen.getByText(WARN_END)).toBeInTheDocument();
  });
});

describe("다시시작 (스펙 2.4)", () => {
  function clickRestart() {
    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "다시시작" }),
    );
  }

  it("[취소]면 다시 켜지 않는다", () => {
    const { fakeWindow } = renderShell({ session: STORE });
    clickRestart();

    fireEvent.click(screen.getByRole("button", { name: "취소" }));

    expect(fakeWindow.win.restart).not.toHaveBeenCalled();
  });

  it("[다시시작]이면 주문 중단을 보낸 뒤 프로그램을 다시 켠다. 자동 로그인 토큰은 지우지 않는다", async () => {
    const server = createControlledStoreStatusApi();
    const tokenStore = createMemoryTokenStore();
    await tokenStore.save("refresh-1");
    const { fakeWindow } = renderShell({
      session: STORE,
      storeStatusApi: server.api,
      tokenStore,
    });
    clickRestart();

    fireEvent.click(screen.getByRole("button", { name: "다시시작" }));

    expect(server.api.setAcceptingOrders).toHaveBeenCalledWith(false);
    expect(fakeWindow.win.restart).not.toHaveBeenCalled();
    await act(async () => server.last().resolve());
    await waitFor(() =>
      expect(fakeWindow.win.restart).toHaveBeenCalledTimes(1),
    );
    expect(await tokenStore.load()).toBe("refresh-1");
  });

  it("주문 중단이 실패해도 다시 켠다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({
      session: STORE,
      storeStatusApi: server.api,
    });
    clickRestart();
    fireEvent.click(screen.getByRole("button", { name: "다시시작" }));

    await act(async () => server.last().reject(new Error("x")));

    await waitFor(() =>
      expect(fakeWindow.win.restart).toHaveBeenCalledTimes(1),
    );
  });

  it("로그인 전에는 요청 없이 다시 켠다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({ storeStatusApi: server.api });
    clickRestart();

    fireEvent.click(screen.getByRole("button", { name: "다시시작" }));

    await waitFor(() =>
      expect(fakeWindow.win.restart).toHaveBeenCalledTimes(1),
    );
    expect(server.api.setAcceptingOrders).not.toHaveBeenCalled();
  });

  it("다시 켜지 못하면 팝업을 닫고, 서버에 보낸 주문 중단에 맞춰 토글도 OFF로 내린다", async () => {
    const fakeWindow = createFakeWindow();
    fakeWindow.win.restart.mockRejectedValue(new Error("x"));
    renderShell({ windowApi: fakeWindow.win, session: STORE });
    fireEvent.click(toggle());
    await waitFor(() =>
      expect(toggle()).toHaveAttribute("aria-checked", "true"),
    );
    clickRestart();

    fireEvent.click(screen.getByRole("button", { name: "다시시작" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(toggle()).toHaveAttribute("aria-checked", "false");
  });
});
