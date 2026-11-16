import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoreStatusApi } from "../../shared/api/store-status";
import { createMockStoreStatusApi } from "../../shared/api/store-status";
import type { AppWindow } from "../../shared/platform/window";
import {
  createControlledStoreStatusApi,
  createFakeWindow,
} from "../../test/fakes";
import { AppShell } from "./AppShell";
import { AppShellProvider } from "./AppShellContext";
import type { Session } from "./app-shell-state";

const STORE: Session = { storeName: "힘이나는커피생활 종로점" };

function renderShell(
  options: {
    session?: Session | null;
    windowApi?: AppWindow;
    storeStatusApi?: StoreStatusApi;
  } = {},
) {
  const fakeWindow = createFakeWindow();
  const windowApi = options.windowApi ?? fakeWindow.win;
  const storeStatusApi =
    options.storeStatusApi ?? createMockStoreStatusApi({ delayMs: 0 });
  const { unmount } = render(
    <AppShellProvider
      windowApi={windowApi}
      storeStatusApi={storeStatusApi}
      initialSession={options.session ?? null}
    >
      <AppShell />
    </AppShellProvider>,
  );
  return { fakeWindow, unmount };
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
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "로그인" })).toBeInTheDocument();
  });

  it("로그인 후: 점포명 · 토글 · 탭 5개가 보이고 첫 탭은 주문접수다", () => {
    renderShell({ session: STORE });

    expect(screen.getByText(STORE.storeName)).toBeInTheDocument();
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

  it("개발용 모의 로그인으로 로그인 후 화면으로 바꿀 수 있다", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "개발용 모의 로그인" }));

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

  it("환경설정 하위 탭 3개 사이를 오갈 수 있다", () => {
    renderShell({ session: STORE });
    fireEvent.click(screen.getByRole("tab", { name: "환경설정" }));

    const sub = screen.getByRole("tablist", { name: "환경설정 메뉴" });
    expect(
      within(sub)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["위젯설정", "프린터설정", "AI챗봇 인기메뉴 설정"]);
    for (const name of ["프린터설정", "AI챗봇 인기메뉴 설정", "위젯설정"]) {
      fireEvent.click(within(sub).getByRole("tab", { name }));
      expect(within(sub).getByRole("tab", { name })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(screen.getByRole("tabpanel", { name })).toBeInTheDocument();
    }
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
    ["창 최소화", "minimize"],
    ["창 줄이기", "restoreDefaultSize"],
    ["창 늘리기", "maximize"],
  ] as const)("%s → 창 감싸기의 %s를 부르고 메뉴를 닫는다", (label, fn) => {
    const { fakeWindow } = renderShell();

    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: label }),
    );

    expect(fakeWindow.win[fn]).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    );
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
      name: "주문 수신을 중단하시겠습니까?",
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
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
    ).toEqual(["창 최소화", "창 줄이기", "창 늘리기", "시스템종료"]);
  });

  it("로그인 후 메뉴에는 로그아웃까지 5개가 있다", () => {
    renderShell({ session: STORE });

    const menu = openMoreMenu();
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((m) => m.textContent),
    ).toEqual([
      "창 최소화",
      "창 줄이기",
      "창 늘리기",
      "시스템종료",
      "로그아웃",
    ]);
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
    expect(screen.getByText(STORE.storeName)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "개발용 모의 로그인" }));
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
    fireEvent.click(screen.getByRole("button", { name: "개발용 모의 로그인" }));

    expect(toggle()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("tab", { name: "주문접수" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("시스템종료 (스펙 2.3, 2.4)", () => {
  function clickShutdown() {
    fireEvent.click(
      within(openMoreMenu()).getByRole("menuitem", { name: "시스템종료" }),
    );
  }

  it("화면정의서 문구의 팝업을 띄우고, [취소]면 끝내지 않는다", () => {
    const { fakeWindow } = renderShell({ session: STORE });

    clickShutdown();

    const dialog = screen.getByRole("alertdialog", {
      name: "시스템을 종료하겠습니까?",
    });
    expect(dialog).toHaveAccessibleDescription(
      "주문 수신이 자동으로 중단됩니다.",
    );
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["취소", "시스템 종료"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(fakeWindow.win.exit).not.toHaveBeenCalled();
  });

  it("[시스템 종료]면 주문 중단 요청 뒤 로그아웃하고 프로그램을 끝낸다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({
      session: STORE,
      storeStatusApi: server.api,
    });

    clickShutdown();
    fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));

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
    fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
    expect(server.calls.map((c) => c.accepting)).toEqual([true]);
    await act(async () => server.calls[0].resolve());
    expect(server.calls.map((c) => c.accepting)).toEqual([true, false]);
    expect(fakeWindow.win.exit).not.toHaveBeenCalled();
    await act(async () => server.last().resolve());

    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
  });

  it("시스템종료 팝업도 초점이 [취소]에 있다", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
    await act(async () => server.last().reject(new Error("x")));

    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
  });

  it("로그인 전에도 같은 팝업을 띄우고, 확인하면 요청 없이 끝낸다", async () => {
    const server = createControlledStoreStatusApi();
    const { fakeWindow } = renderShell({ storeStatusApi: server.api });

    clickShutdown();
    expect(
      screen.getByRole("alertdialog", { name: "시스템을 종료하겠습니까?" }),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
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
    fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
    act(() => {
      fakeWindow.requestClose();
    });
    await act(async () => server.last().resolve());

    // 로그아웃은 됐지만 종료가 끝날 때까지 팝업은 처리 중으로 남는다
    expect(fakeWindow.win.exit).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("alertdialog", {
      name: "시스템을 종료하겠습니까?",
    });
    expect(
      within(dialog).getByRole("button", { name: "시스템 종료" }),
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
      fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
    });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    clickShutdown();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
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
    fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
    await act(async () => server.last().resolve());

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
    clickShutdown();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "시스템 종료" }));
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

  it("운영체제 닫기(Alt+F4)를 받으면 시스템종료 팝업을 띄운다", () => {
    const { fakeWindow } = renderShell({ session: STORE });

    act(() => {
      expect(fakeWindow.requestClose()).toBe(true);
    });

    expect(
      screen.getByRole("alertdialog", { name: "시스템을 종료하겠습니까?" }),
    ).toBeInTheDocument();
    expect(fakeWindow.win.exit).not.toHaveBeenCalled();
  });
});
