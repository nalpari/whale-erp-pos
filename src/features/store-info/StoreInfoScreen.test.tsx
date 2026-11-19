// 매장정보 화면 (SPEC-store-info 8장). 진짜 AppShell + 모의 매장정보 서버로 열기 · 저장 · 탭 이동 확인창을 돌린다.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockAuthApi, type Session } from "../../shared/api/auth";
import { createMockStoreStatusApi } from "../../shared/api/store-status";
import {
  createMockStoreInfoApi,
  type StoreInfoApi,
} from "../../shared/api/store-info";
import { StoreInfoApiContext } from "../../shared/api/store-info-context";
import { createFakeLogApi } from "../../shared/log/log-api";
import {
  createFakePrinterApi,
  createMemoryPrinterSettingsStore,
} from "../../shared/printer/printer-api";
import { createMemoryTokenStore } from "../../shared/session/token-store";
import { createFakeWindow } from "../../test/fakes";
import { AppShell } from "../app-shell/AppShell";
import { AppShellProvider, useAppShell } from "../app-shell/AppShellContext";
import { STORE_INFO_TEXTS as T } from "./store-info-texts";

vi.mock("@tauri-apps/plugin-log", () => {
  const noop = async () => {};
  return { info: noop, warn: noop, error: noop };
});

const STORE: Session = {
  accountType: "store",
  store: { id: "s1", code: "ST000001", name: "시험 점포" },
  accessToken: "t",
};

// 바탕화면 위젯이 탭을 옮기는 길(actions.selectTab 직접 호출)을 흉내 낸다.
function WidgetJump() {
  const { actions } = useAppShell();
  return (
    <button type="button" onClick={() => actions.selectTab("order-board")}>
      위젯 이동
    </button>
  );
}

function renderApp(api: StoreInfoApi) {
  return render(
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
      <StoreInfoApiContext.Provider value={api}>
        <AppShell />
        <WidgetJump />
      </StoreInfoApiContext.Provider>
    </AppShellProvider>,
  );
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
const press = async (el: HTMLElement) => {
  fireEvent.click(el);
  await flush();
};
const mainTab = (name: string) => screen.getByRole("tab", { name });
const intro = () => screen.getByRole("textbox", { name: /점포 소개/ });
const notice = () => screen.getByRole("textbox", { name: /점포 공지/ });
const saveButton = () => screen.getByRole("button", { name: T.save });
const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });

async function openStoreInfo(api: StoreInfoApi) {
  renderApp(api);
  await flush();
  await press(mainTab("매장정보"));
}
const mock = (shouldFail?: (k: "load" | "save") => boolean) =>
  createMockStoreInfoApi({ delayMs: 0, shouldFail });

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("열기", () => {
  it("서버 값과 태그 12개가 보이고, 바꾸기 전에는 [저장]이 막혀 있다", async () => {
    await openStoreInfo(mock());
    expect(screen.getByText(T.guide)).toBeInTheDocument();
    expect(intro()).toHaveValue(
      "갓 내린 커피와 수제 디저트를 파는 동네 카페입니다.",
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(12);
    expect(screen.getByRole("checkbox", { name: "와이파이" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "제로페이" }),
    ).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("읽기에 실패하면 [다시 시도]가 보이고 저장 칸은 없다", async () => {
    let fail = true;
    await openStoreInfo(mock(() => fail));
    expect(screen.getByText(T.loadFailed)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: T.save })).toBeNull();
    fail = false;
    await press(screen.getByRole("button", { name: T.retry }));
    expect(intro()).toBeInTheDocument();
  });
});

describe("입력 제한", () => {
  it("소개가 비면 안내가 보이고 저장되지 않는다", async () => {
    await openStoreInfo(mock());
    type(intro(), "  ");
    expect(screen.getByText(T.introRequired)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("100자 · 3줄 · 200자 · 5줄을 넘기면 자르고 안내한다", async () => {
    await openStoreInfo(mock());
    type(intro(), "가".repeat(120));
    expect(intro()).toHaveValue("가".repeat(100));
    expect(screen.getByText("100자까지 입력할 수 있습니다.")).toBeVisible();
    expect(screen.getByText("100 / 100자")).toBeInTheDocument();
    type(intro(), "1\n2\n3\n4");
    expect(intro()).toHaveValue("1\n2\n3");
    expect(screen.getByText("3줄까지 입력할 수 있습니다.")).toBeVisible();
    type(notice(), "나".repeat(250));
    expect(notice()).toHaveValue("나".repeat(200));
    expect(screen.getByText("200자까지 입력할 수 있습니다.")).toBeVisible();
    type(notice(), "1\n2\n3\n4\n5\n6");
    expect(screen.getByText("5줄까지 입력할 수 있습니다.")).toBeVisible();
  });

  it("한글 조합이 가운데에서 끝나도 원래 글을 지킨다", async () => {
    await openStoreInfo(mock());
    const full = "가".repeat(100);
    type(intro(), full);
    fireEvent.compositionStart(intro());
    type(intro(), "가".repeat(50) + "나" + "가".repeat(50));
    fireEvent.compositionEnd(intro());
    expect(intro()).toHaveValue(full);
  });

  it("공지 6줄째는 잘려 5줄만 남는다", async () => {
    await openStoreInfo(mock());
    type(notice(), "1\n2\n3\n4\n5\n6");
    expect(notice()).toHaveValue("1\n2\n3\n4\n5");
  });

  it("한글 조합 중에는 자르지 않고, 끝나면 자른다", async () => {
    await openStoreInfo(mock());
    fireEvent.compositionStart(intro());
    type(intro(), "가".repeat(120));
    expect(intro()).toHaveValue("가".repeat(120));
    fireEvent.compositionEnd(intro());
    expect(intro()).toHaveValue("가".repeat(100));
  });
});

it("읽기가 10초 안에 끝나지 않으면 [다시 시도]가 보인다", async () => {
  await openStoreInfo({ ...mock(), load: () => new Promise(() => {}) });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  expect(screen.getByText(T.loadFailed)).toBeInTheDocument();
});

describe("저장", () => {
  it("저장하면 토스트가 뜨고, 다시 열면 저장한 값 · 토글 · 태그가 그대로다", async () => {
    const api = mock();
    await openStoreInfo(api);
    type(intro(), "새 소개");
    await press(screen.getByRole("switch", { name: /점포 공지/ }));
    await press(screen.getByRole("checkbox", { name: "제로페이" }));
    await press(screen.getByRole("switch", { name: /편의시설/ }));
    await press(saveButton());
    expect(screen.getByText(T.saved)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();

    await press(mainTab("주문접수"));
    await press(mainTab("매장정보"));
    expect(intro()).toHaveValue("새 소개");
    expect(screen.getByRole("checkbox", { name: "제로페이" })).toBeChecked();
    expect(screen.getByRole("switch", { name: /점포 공지/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("switch", { name: /편의시설/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("저장 중에는 버튼이 잠긴다", async () => {
    let finish: () => void = () => {};
    const api: StoreInfoApi = {
      ...mock(),
      save: () => new Promise<void>((r) => (finish = r)),
    };
    await openStoreInfo(api);
    type(intro(), "새 소개");
    await press(saveButton());
    expect(screen.getByRole("button", { name: T.saving })).toBeDisabled();
    expect(intro()).toBeDisabled();
    finish();
    await flush();
    expect(screen.getByText(T.saved)).toBeInTheDocument();
  });

  it("저장에 실패하면 안내 토스트가 뜨고 입력값이 남는다", async () => {
    await openStoreInfo(mock((k) => k === "save"));
    type(intro(), "새 소개");
    await press(saveButton());
    expect(screen.getByText(T.saveFailed)).toBeInTheDocument();
    expect(intro()).toHaveValue("새 소개");
    expect(saveButton()).toBeEnabled();
  });

  it("10초 안에 응답이 없으면 실패로 본다", async () => {
    const api: StoreInfoApi = { ...mock(), save: () => new Promise(() => {}) };
    await openStoreInfo(api);
    type(intro(), "새 소개");
    await press(saveButton());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByText(T.saveFailed)).toBeInTheDocument();
  });

  it("빈 공지 · 태그 0개라도 표시를 켠 채 저장된다 (결정 B)", async () => {
    const api = mock();
    const save = vi.spyOn(api, "save");
    await openStoreInfo(api);
    type(notice(), "");
    await press(screen.getByRole("checkbox", { name: "와이파이" }));
    await press(screen.getByRole("checkbox", { name: "주차" }));
    await press(saveButton());
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        notice: "",
        noticeVisible: true,
        selectedTags: [],
        tagsVisible: true,
      }),
    );
  });
});

describe("저장하지 않고 다른 탭으로 (결정 A)", () => {
  it("바뀐 게 없으면 확인창 없이 이동한다", async () => {
    await openStoreInfo(mock());
    await press(mainTab("주문접수"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mainTab("주문접수")).toHaveAttribute("aria-selected", "true");
  });

  it("이미 매장정보 탭이면 다시 눌러도 확인창이 없다", async () => {
    await openStoreInfo(mock());
    type(intro(), "고친 소개");
    await press(mainTab("매장정보"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(intro()).toHaveValue("고친 소개");
  });

  it("[취소]면 남고, [나가기]면 저장값으로 되돌리고 이동한다", async () => {
    await openStoreInfo(mock());
    type(intro(), "고친 소개");
    await press(mainTab("주문접수"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(T.leave.title);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(T.leave.message);
    expect(screen.getByRole("button", { name: T.leave.cancel })).toHaveFocus();

    await press(screen.getByRole("button", { name: T.leave.cancel }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(intro()).toHaveValue("고친 소개");

    await press(mainTab("주문접수"));
    await press(screen.getByRole("button", { name: T.leave.confirm }));
    expect(mainTab("주문접수")).toHaveAttribute("aria-selected", "true");
    await press(mainTab("매장정보"));
    expect(intro()).toHaveValue(
      "갓 내린 커피와 수제 디저트를 파는 동네 카페입니다.",
    );
  });
});

describe("저장 중 탭 이동 (결정 B)", () => {
  it("저장이 가는 동안 다른 탭을 눌러도 아무 일 없고, 끝나면 다시 옮길 수 있다", async () => {
    let finish: () => void = () => {};
    const api: StoreInfoApi = {
      ...mock(),
      save: () => new Promise<void>((r) => (finish = r)),
    };
    await openStoreInfo(api);
    type(intro(), "새 소개");
    await press(saveButton());
    await press(mainTab("주문접수"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mainTab("매장정보")).toHaveAttribute("aria-selected", "true");
    finish();
    await flush();
    expect(screen.getByText(T.saved)).toBeInTheDocument();
    await press(mainTab("주문접수"));
    expect(mainTab("주문접수")).toHaveAttribute("aria-selected", "true");
  });
});

describe("위젯이 탭을 옮길 때 (결정 A-1)", () => {
  it("확인창 없이 이동하고, 저장 안 한 변경은 버려져 다시 열면 저장값이다", async () => {
    await openStoreInfo(mock());
    type(intro(), "고친 소개");
    await press(screen.getByRole("button", { name: "위젯 이동" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mainTab("주문접수")).toHaveAttribute("aria-selected", "true");
    await press(mainTab("매장정보"));
    expect(intro()).toHaveValue(
      "갓 내린 커피와 수제 디저트를 파는 동네 카페입니다.",
    );
  });

  it("저장 중에도 위젯 이동은 막지 않는다", async () => {
    const api: StoreInfoApi = { ...mock(), save: () => new Promise(() => {}) };
    await openStoreInfo(api);
    type(intro(), "새 소개");
    await press(saveButton());
    await press(screen.getByRole("button", { name: "위젯 이동" }));
    expect(mainTab("주문접수")).toHaveAttribute("aria-selected", "true");
    // 저장 중 표시가 남아 매장정보 탭의 이동을 영영 막지 않는다.
    await press(mainTab("매장정보"));
    await press(mainTab("주문접수"));
    expect(mainTab("주문접수")).toHaveAttribute("aria-selected", "true");
  });
});

it("저장에 실패하면 탭 이동이 풀리고, 고친 내용이 남아 있으니 확인창이 뜬다", async () => {
  await openStoreInfo(mock((k) => k === "save"));
  type(intro(), "새 소개");
  await press(saveButton());
  await press(mainTab("주문접수"));
  expect(screen.getByRole("alertdialog")).toHaveTextContent(T.leave.title);
});
