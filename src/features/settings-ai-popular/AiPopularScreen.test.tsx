// 인기메뉴 화면 (SPEC-settings-ai-popular 8장). 모의 서버로 조회 · 삭제 · 추가 팝업을 돌린다.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createMockPopularApi,
  type PopularApi,
  type PopularRequestKind,
} from "../../shared/api/popular";
import { createMockSoldOutApi } from "../../shared/api/soldout";
import { AiPopularScreen } from "./AiPopularScreen";
import { POPULAR_TEXTS as T } from "./popular-texts";

vi.mock("@tauri-apps/plugin-log", () => {
  const noop = async () => {};
  return { info: noop, warn: noop, error: noop };
});

function setup(
  opts: {
    failing?: PopularRequestKind[];
    canEdit?: boolean;
    onBusyChange?: (busy: boolean) => void;
    wrap?: (api: PopularApi) => PopularApi;
  } = {},
) {
  const failures = new Set(opts.failing ?? []);
  const base = createMockPopularApi(createMockSoldOutApi({ delayMs: 0 }), {
    delayMs: 0,
    shouldFail: (kind) => failures.has(kind),
  });
  const api = opts.wrap ? opts.wrap(base) : base;
  const props = {
    canEdit: opts.canEdit ?? true,
    onBusyChange: opts.onBusyChange ?? (() => {}),
  };
  const view = render(<AiPopularScreen api={api} refreshSeq={0} {...props} />);
  const rerender = (refreshSeq: number) =>
    view.rerender(
      <AiPopularScreen api={api} refreshSeq={refreshSeq} {...props} />,
    );
  return { ...view, api, failures, rerender };
}

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0].textContent);

async function openPopup() {
  fireEvent.click(await screen.findByRole("button", { name: T.add }));
  const popup = await screen.findByRole("dialog", { name: T.popup.title });
  await within(popup).findByRole("checkbox", { name: "카푸치노" });
  return popup;
}
const check = (popup: HTMLElement, name: string) =>
  fireEvent.click(within(popup).getByRole("checkbox", { name }));
const submit = (popup: HTMLElement) =>
  fireEvent.click(within(popup).getByRole("button", { name: T.popup.submit }));

describe("AiPopularScreen 목록", () => {
  it("예시 2개가 먼저 추가한 순으로 보이고 개수 · 꼬리표가 맞다", async () => {
    setup();
    expect(await screen.findByText(T.guide)).toBeInTheDocument();
    expect(names()).toEqual(["아메리카노", "카페라떼"]);
    expect(screen.getByText(T.count(2))).toBeInTheDocument();
    // 아메리카노는 T09 모의에서 일시품절이다.
    expect(screen.getByText(T.tag.temp)).toBeInTheDocument();
  });

  it("불러오기에 실패하면 [다시 시도]로 다시 읽는다", async () => {
    const { failures } = setup({ failing: ["loadList"] });
    expect(await screen.findByText(T.loadFailed)).toBeInTheDocument();
    failures.clear();
    fireEvent.click(screen.getByRole("button", { name: T.retry }));
    expect(await screen.findByText(T.guide)).toBeInTheDocument();
  });

  it("refreshSeq가 바뀌면 다시 조회한다", async () => {
    const { api, rerender } = setup();
    const spy = vi.spyOn(api, "loadList");
    await screen.findByText(T.guide);
    rerender(1);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("비었으면 안내 문구를 보인다", async () => {
    setup();
    for (const n of ["아메리카노", "카페라떼"]) {
      fireEvent.click(
        await screen.findByRole("button", { name: `${n} ${T.remove}` }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: T.confirmRemove.confirm }),
      );
      await vi.waitFor(() =>
        expect(screen.queryByText(n)).not.toBeInTheDocument(),
      );
    }
    expect(screen.getByText(T.empty)).toBeInTheDocument();
    expect(screen.getByText(T.count(0))).toBeInTheDocument();
  });
});

describe("AiPopularScreen 권한", () => {
  it("점포번호 계정은 목록만 보이고 추가 · 삭제 버튼이 없다", async () => {
    setup({ canEdit: false });
    expect(await screen.findByText(T.readOnly)).toBeInTheDocument();
    expect(names()).toEqual(["아메리카노", "카페라떼"]);
    expect(screen.queryByRole("button", { name: T.add })).toBeNull();
    expect(screen.queryByRole("button", { name: /삭제/ })).toBeNull();
  });

  it("웨일ERP 계정에는 안내 줄이 없다", async () => {
    setup();
    await screen.findByText(T.guide);
    expect(screen.queryByText(T.readOnly)).toBeNull();
  });
});

describe("AiPopularScreen 삭제", () => {
  it("[취소]하면 그대로, [확인]하면 바로 삭제된다", async () => {
    const { api } = setup();
    const spy = vi.spyOn(api, "remove");
    fireEvent.click(
      await screen.findByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    expect(screen.getByText(T.confirmRemove.title)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.cancel }),
    );
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() => expect(names()).toEqual(["아메리카노"]));
    expect(spy).toHaveBeenCalledWith("M002");
    expect(screen.getByText(T.count(1))).toBeInTheDocument();
  });

  it("삭제 요청 중에는 [+ 인기상품 추가]도 막힌다", async () => {
    const { api } = setup();
    let finish: () => void = () => {};
    vi.spyOn(api, "remove").mockReturnValue(
      new Promise<void>((r) => (finish = r)),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: T.add })).toBeDisabled(),
    );
    finish();
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: T.add })).toBeEnabled(),
    );
  });

  it("삭제가 실패하면 목록에 남기고 안내한다", async () => {
    setup({ failing: ["remove"] });
    fireEvent.click(
      await screen.findByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    expect(await screen.findByText(T.saveFailed)).toBeInTheDocument();
    expect(names()).toEqual(["아메리카노", "카페라떼"]);
  });

  it("요청이 가는 중에는 busy를 알린다", async () => {
    const onBusyChange = vi.fn();
    setup({ onBusyChange });
    fireEvent.click(
      await screen.findByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));
    await vi.waitFor(() => expect(names()).toEqual(["아메리카노"]));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
});

describe("AiPopularScreen 추가 팝업", () => {
  it("[옵션] 탭이 없고 옵션 상품도 안 보인다", async () => {
    setup();
    const popup = await openPopup();
    expect(within(popup).queryByRole("tab", { name: "옵션" })).toBeNull();
    expect(
      within(popup).queryByRole("checkbox", { name: "샷 추가" }),
    ).toBeNull();
  });

  it("숨김은 못 고르고 일시품절은 고르며 등록됨은 막힌다", async () => {
    setup();
    const popup = await openPopup();
    expect(
      within(popup).getByRole("checkbox", { name: "치즈케이크" }),
    ).toBeDisabled();
    expect(within(popup).getByText(T.tag.hidden)).toBeInTheDocument();
    // 아메리카노는 일시품절이지만 이미 인기메뉴라 등록됨으로 막힌다.
    expect(
      within(popup).getByRole("checkbox", { name: "아메리카노" }),
    ).toBeDisabled();
    expect(
      within(popup).getByRole("checkbox", { name: "카푸치노" }),
    ).toBeEnabled();
    expect(within(popup).getAllByText(T.popup.registered)).toHaveLength(2);
  });

  it("남은 자리(3개)만큼 고르면 나머지가 막히고 남은 수를 보인다", async () => {
    setup();
    const popup = await openPopup();
    expect(within(popup).getByText(T.popup.selected(0, 3))).toBeInTheDocument();
    check(popup, "카푸치노");
    check(popup, "콜드브루");
    check(popup, "에스프레소");
    expect(within(popup).getByText(T.popup.selected(3, 0))).toBeInTheDocument();
    expect(
      within(popup).getByRole("checkbox", { name: "초코라떼" }),
    ).toBeDisabled();
    // 고른 것은 풀 수 있다.
    expect(
      within(popup).getByRole("checkbox", { name: "카푸치노" }),
    ).toBeEnabled();
    check(popup, "카푸치노");
    expect(
      within(popup).getByRole("checkbox", { name: "초코라떼" }),
    ).toBeEnabled();
  });

  it("추가하면 바로 저장되고 팝업이 남으며 등록됨이 된다", async () => {
    setup();
    const popup = await openPopup();
    check(popup, "카푸치노");
    submit(popup);
    await screen.findByText(T.popup.added(1));
    expect(screen.getByRole("dialog", { name: T.popup.title })).toBe(popup);
    expect(within(popup).getAllByText(T.popup.registered)).toHaveLength(3);
    fireEvent.click(within(popup).getByRole("button", { name: T.popup.close }));
    expect(names()).toEqual(["아메리카노", "카페라떼", "카푸치노"]);
    expect(screen.getByText(T.count(3))).toBeInTheDocument();
  });

  it("5개가 차면 팝업에 한도 문구가 뜨고 닫으면 [+ 인기상품 추가]가 막힌다", async () => {
    setup();
    const popup = await openPopup();
    for (const n of ["카푸치노", "콜드브루", "에스프레소"]) check(popup, n);
    submit(popup);
    await screen.findByText(T.popup.added(3));
    expect(within(popup).getByText(T.popup.limitReached)).toBeInTheDocument();
    expect(
      within(popup).getByRole("checkbox", { name: "초코라떼" }),
    ).toBeDisabled();
    fireEvent.click(within(popup).getByRole("button", { name: T.popup.close }));
    expect(screen.getByText(T.count(5))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T.add })).toBeDisabled();
  });

  it("추가가 실패하면 체크를 남기고 안내한다", async () => {
    setup({ failing: ["add"] });
    const popup = await openPopup();
    check(popup, "카푸치노");
    submit(popup);
    expect(await screen.findByText(T.saveFailed)).toBeInTheDocument();
    expect(
      within(popup).getByRole("checkbox", { name: "카푸치노" }),
    ).toBeChecked();
  });

  it("서버가 일부만 추가하면 나머지 건수를 알린다", async () => {
    setup({
      wrap: (api) => ({
        ...api,
        // 다른 곳에서 먼저 등록한 경우를 흉내 낸다: 요청한 2개 중 1개만 추가된다.
        add: async (codes) => api.add(codes.slice(0, 1)),
      }),
    });
    const popup = await openPopup();
    check(popup, "카푸치노");
    check(popup, "콜드브루");
    submit(popup);
    expect(
      await screen.findByText(T.popup.addedPartial(1, 1)),
    ).toBeInTheDocument();
  });
});

describe("AiPopularScreen 저장 · 조회 엇갈림", () => {
  it("추가 · 삭제한 값은 다시 조회해도 그대로 보인다", async () => {
    const { rerender } = setup();
    const popup = await openPopup();
    check(popup, "카푸치노");
    submit(popup);
    await screen.findByText(T.popup.added(1));
    fireEvent.click(within(popup).getByRole("button", { name: T.popup.close }));
    fireEvent.click(
      screen.getByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() => expect(names()).toEqual(["아메리카노", "카푸치노"]));
    rerender(1);
    await vi.waitFor(() =>
      expect(screen.getByText(T.count(2))).toBeInTheDocument(),
    );
    expect(names()).toEqual(["아메리카노", "카푸치노"]);
  });

  it("일시품절 메뉴는 실제로 골라 추가할 수 있다", async () => {
    setup();
    fireEvent.click(
      await screen.findByRole("button", { name: `아메리카노 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() => expect(names()).toEqual(["카페라떼"]));
    const popup = await openPopup();
    check(popup, "아메리카노");
    submit(popup);
    await screen.findByText(T.popup.added(1));
    fireEvent.click(within(popup).getByRole("button", { name: T.popup.close }));
    expect(names()).toEqual(["카페라떼", "아메리카노"]);
    expect(screen.getByText(T.tag.temp)).toBeInTheDocument();
  });

  it("조회 중에 삭제가 끝나면 옛 조회 응답이 삭제한 항목을 되살리지 않는다", async () => {
    const { api, rerender } = setup();
    await screen.findByText(T.guide);
    const real = api.loadList.bind(api);
    let finish: () => void = () => {};
    vi.spyOn(api, "loadList").mockImplementationOnce(async () => {
      const old = await real();
      await new Promise<void>((r) => (finish = r));
      return old;
    });
    rerender(1);
    fireEvent.click(
      screen.getByRole("button", { name: `카페라떼 ${T.remove}` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() => expect(names()).toEqual(["아메리카노"]));
    finish();
    await vi.waitFor(() =>
      expect(screen.getByText(T.count(1))).toBeInTheDocument(),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(names()).toEqual(["아메리카노"]);
  });

  it("조용한 재조회가 실패하면 목록은 두고 안내만 한다", async () => {
    const { api, rerender } = setup();
    await screen.findByText(T.guide);
    vi.spyOn(api, "loadList").mockRejectedValueOnce(new Error("x"));
    // 일부만 추가되면 화면이 서버 기준으로 조용히 다시 읽는다.
    vi.spyOn(api, "add").mockResolvedValueOnce([]);
    const popup = await openPopup();
    check(popup, "카푸치노");
    submit(popup);
    expect(await screen.findByText(T.loadFailed)).toBeInTheDocument();
    expect(names()).toEqual(["아메리카노", "카페라떼"]);
    void rerender;
  });
});
