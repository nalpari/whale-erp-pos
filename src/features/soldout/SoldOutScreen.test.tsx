// 메뉴품절 화면 (SPEC-soldout 8장). 모의 서버로 조회 · 라디오 · 삭제 · 추가 팝업을 돌린다.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createMockSoldOutApi,
  type SoldOutRequestKind,
} from "../../shared/api/soldout";
import { RequestTimeoutError } from "../../shared/api/with-timeout";
import { SoldOutHarness } from "../../test/soldout-harness";
import { SOLDOUT_TEXTS as T } from "./soldout-texts";

vi.mock("@tauri-apps/plugin-log", () => {
  const noop = async () => {};
  return { info: noop, warn: noop, error: noop };
});

function setup(failing: SoldOutRequestKind[] = []) {
  const failures = new Set(failing);
  const api = createMockSoldOutApi({
    delayMs: 0,
    shouldFail: (kind) => failures.has(kind),
  });
  const view = render(<SoldOutHarness api={api} refreshSeq={0} />);
  return { api, failures, ...view };
}

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0].textContent);

describe("SoldOutScreen", () => {
  it("열면 예시 품절 3개가 최근 추가 순으로 보이고 탭 건수가 맞는다", async () => {
    setup();
    expect(await screen.findByText(T.guide)).toBeInTheDocument();
    expect(names()).toEqual(["샷 추가", "치즈케이크", "아메리카노"]);
    expect(screen.getByRole("tab", { name: "전체 3" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "일시품절 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "숨김 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "숨김 1" }));
    expect(names()).toEqual(["치즈케이크"]);
  });

  it("불러오기에 실패하면 [다시 시도]로 다시 읽는다", async () => {
    const { failures } = setup(["loadList"]);
    expect(await screen.findByText(T.loadFailed)).toBeInTheDocument();
    failures.clear();
    fireEvent.click(screen.getByRole("button", { name: T.retry }));
    expect(await screen.findByText(T.guide)).toBeInTheDocument();
  });

  it("refreshSeq가 바뀌면 다시 조회한다", async () => {
    const api = createMockSoldOutApi({ delayMs: 0 });
    const spy = vi.spyOn(api, "loadList");
    const { rerender } = render(<SoldOutHarness api={api} refreshSeq={0} />);
    await screen.findByText(T.guide);
    rerender(<SoldOutHarness api={api} refreshSeq={1} />);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(screen.getByText(T.guide)).toBeInTheDocument();
  });

  it("표시방식 라디오는 바꾸면 바로 저장되고 토스트가 뜬다", async () => {
    const { api } = setup();
    await screen.findByText(T.guide);
    const group = screen.getByRole("group", { name: "아메리카노 표시방식" });
    fireEvent.click(within(group).getByRole("radio", { name: "숨김" }));
    expect(await screen.findByText(T.saved)).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "숨김" })).toBeChecked();
    expect(screen.getByRole("tab", { name: "숨김 2" })).toBeInTheDocument();
    const saved = (await api.loadList()).find((e) => e.code === "M001");
    expect(saved?.mode).toBe("hidden");
  });

  it("라디오 저장이 실패하면 원래대로 되돌리고 실패 문구를 보인다", async () => {
    setup(["setMode"]);
    await screen.findByText(T.guide);
    const group = screen.getByRole("group", { name: "아메리카노 표시방식" });
    fireEvent.click(within(group).getByRole("radio", { name: "숨김" }));
    // 요청 중에는 그 줄이 잠긴다.
    expect(group).toBeDisabled();
    expect(await screen.findByText(T.saveFailed)).toBeInTheDocument();
    expect(
      within(group).getByRole("radio", { name: "일시품절" }),
    ).toBeChecked();
    expect(group).not.toBeDisabled();
    expect(screen.getByRole("tab", { name: "숨김 1" })).toBeInTheDocument();
  });

  it("[삭제]는 확인창을 띄우고 [확인] 뒤 목록에서 빠진다", async () => {
    const { api } = setup();
    await screen.findByText(T.guide);
    fireEvent.click(screen.getByRole("button", { name: "아메리카노 삭제" }));
    expect(screen.getByText(T.confirmRemove.title)).toBeInTheDocument();
    expect(screen.getByText(T.confirmRemove.message)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    await vi.waitFor(() => expect(names()).toEqual(["샷 추가", "치즈케이크"]));
    expect(screen.getByRole("tab", { name: "전체 2" })).toBeInTheDocument();
    expect((await api.loadList()).some((e) => e.code === "M001")).toBe(false);
  });

  it("삭제 확인창에서 [취소]하면 그대로 남는다", async () => {
    setup();
    await screen.findByText(T.guide);
    fireEvent.click(screen.getByRole("button", { name: "아메리카노 삭제" }));
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.cancel }),
    );
    expect(screen.queryByText(T.confirmRemove.title)).not.toBeInTheDocument();
    expect(names()).toHaveLength(3);
  });

  it("삭제가 실패하면 목록에 남기고 실패 토스트를 보인다", async () => {
    setup(["remove"]);
    await screen.findByText(T.guide);
    fireEvent.click(screen.getByRole("button", { name: "아메리카노 삭제" }));
    fireEvent.click(
      screen.getByRole("button", { name: T.confirmRemove.confirm }),
    );
    expect(await screen.findByText(T.saveFailed)).toBeInTheDocument();
    expect(names()).toHaveLength(3);
  });

  it("서버 목록이 비어 있으면 빈 목록 문구를 보인다", async () => {
    const api = createMockSoldOutApi({ delayMs: 0 });
    vi.spyOn(api, "loadList").mockResolvedValue([]);
    render(<SoldOutHarness api={api} refreshSeq={0} />);
    expect(await screen.findByText(T.empty)).toBeInTheDocument();
  });

  describe("목록 검색", () => {
    const search = () => screen.getByRole("textbox", { name: T.search });
    const type = (value: string) =>
      fireEvent.change(search(), { target: { value } });

    it("입력하면 바로 거르고(대소문자 · 앞뒤 공백 무시) 탭 건수도 결과 기준이다", async () => {
      setup();
      await screen.findByText(T.guide);
      type("  치즈 ");
      expect(names()).toEqual(["치즈케이크"]);
      expect(screen.getByRole("tab", { name: "전체 1" })).toBeInTheDocument();
      expect(
        screen.getByRole("tab", { name: "일시품절 0" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "숨김 1" })).toBeInTheDocument();
    });

    it("[검색]을 누르면 같은 결과를 보이고 입력칸 초점을 뺀다(검색어가 비어도 전체를 보인다)", async () => {
      setup();
      await screen.findByText(T.guide);
      search().focus();
      type("치즈");
      fireEvent.click(screen.getByRole("button", { name: T.searchButton }));
      expect(names()).toEqual(["치즈케이크"]);
      expect(search()).not.toHaveFocus();
      type("");
      fireEvent.click(screen.getByRole("button", { name: T.searchButton }));
      expect(names()).toHaveLength(3);
    });

    it("Enter로도 초점이 빠진다", async () => {
      setup();
      await screen.findByText(T.guide);
      search().focus();
      type("샷");
      fireEvent.submit(screen.getByRole("search"));
      expect(search()).not.toHaveFocus();
      expect(names()).toEqual(["샷 추가"]);
    });

    it("검색칸 · [검색] · [+ 품절 상품 추가]가 한 줄에 있고 안내 문구는 그 아래다", async () => {
      setup();
      await screen.findByText(T.guide);
      const row = screen.getByRole("search");
      expect(
        within(row).getByRole("textbox", { name: T.search }),
      ).toBeInTheDocument();
      expect(
        within(row).getByRole("button", { name: T.searchButton }),
      ).toBeInTheDocument();
      expect(
        within(row).getByRole("button", { name: T.add }),
      ).toBeInTheDocument();
      expect(row).not.toContainElement(screen.getByText(T.guide));
    });

    it("고른 상태 탭 안에서 거른다", async () => {
      setup();
      await screen.findByText(T.guide);
      fireEvent.click(screen.getByRole("tab", { name: "숨김 1" }));
      type("샷");
      expect(screen.getByText(T.noMatch)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("tab", { name: "일시품절 1" }));
      expect(names()).toEqual(["샷 추가"]);
    });

    it("결과가 없으면 안내를 보이고, ×로 지우면 전체가 돌아온다", async () => {
      setup();
      await screen.findByText(T.guide);
      expect(
        screen.queryByRole("button", { name: T.clearSearch }),
      ).not.toBeInTheDocument();
      type("없는상품");
      expect(screen.getByText(T.noMatch)).toBeInTheDocument();
      expect(screen.queryByText(T.empty)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: T.clearSearch }));
      expect(search()).toHaveValue("");
      expect(names()).toHaveLength(3);
    });

    it("다시 조회해도 검색어가 남는다", async () => {
      const api = createMockSoldOutApi({ delayMs: 0 });
      const spy = vi.spyOn(api, "loadList");
      const { rerender } = render(<SoldOutHarness api={api} refreshSeq={0} />);
      await screen.findByText(T.guide);
      type("아메");
      rerender(<SoldOutHarness api={api} refreshSeq={1} />);
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
      expect(search()).toHaveValue("아메");
      expect(names()).toEqual(["아메리카노"]);
    });

    it("추가에 성공하면 검색어를 지워 방금 추가한 항목이 맨 위에 보인다(팝업은 열린 채)", async () => {
      setup();
      await screen.findByText(T.guide);
      type("아메");
      fireEvent.click(screen.getByRole("button", { name: T.add }));
      const popup = await screen.findByRole("dialog", { name: T.popup.title });
      fireEvent.click(
        await within(popup).findByRole("checkbox", { name: "스콘" }),
      );
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      await screen.findByText(T.popup.added(1));
      expect(screen.getByRole("dialog", { name: T.popup.title })).toBe(popup);
      expect(search()).toHaveValue("");
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.close }),
      );
      expect(names()[0]).toBe("스콘");
    });

    it("하나도 추가되지 않으면 검색어는 그대로 둔다", async () => {
      const { api } = setup();
      vi.spyOn(api, "add").mockResolvedValue([]);
      await screen.findByText(T.guide);
      type("아메");
      fireEvent.click(screen.getByRole("button", { name: T.add }));
      const popup = await screen.findByRole("dialog", { name: T.popup.title });
      fireEvent.click(
        await within(popup).findByRole("checkbox", { name: "스콘" }),
      );
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      await screen.findByText(T.popup.allSkipped(1));
      expect(search()).toHaveValue("아메");
    });
  });

  describe("추가 팝업", () => {
    async function openPopup(failing: SoldOutRequestKind[] = []) {
      const ctx = setup(failing);
      await screen.findByText(T.guide);
      fireEvent.click(screen.getByRole("button", { name: T.add }));
      const popup = await screen.findByRole("dialog", { name: T.popup.title });
      return { ...ctx, popup };
    }
    const check = (popup: HTMLElement, name: string) =>
      fireEvent.click(within(popup).getByRole("checkbox", { name }));

    it("이미 등록된 상품은 고를 수 없고 「등록됨」이 붙는다", async () => {
      const { popup } = await openPopup();
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      expect(
        within(popup).getByRole("checkbox", { name: "아메리카노" }),
      ).toBeDisabled();
      expect(
        within(popup).getByRole("checkbox", { name: "치즈케이크" }),
      ).toBeDisabled();
      expect(within(popup).getAllByText(T.popup.registered)).toHaveLength(2);
      // [전체]에는 옵션이 없다.
      expect(
        within(popup).queryByRole("checkbox", { name: "샷 추가" }),
      ).toBeNull();
    });

    it("검색은 바로 거르고, 카테고리를 넘어가도 체크가 유지되며 개수가 센다", async () => {
      const { popup } = await openPopup();
      check(
        popup,
        await within(popup)
          .findByRole("checkbox", { name: "카페라떼" })
          .then(() => "카페라떼"),
      );
      fireEvent.change(
        within(popup).getByRole("searchbox", { name: T.popup.search }),
        {
          target: { value: "라떼" },
        },
      );
      expect(
        within(popup).queryByRole("checkbox", { name: "스콘" }),
      ).toBeNull();
      expect(
        within(popup).getByRole("checkbox", { name: "녹차라떼" }),
      ).toBeInTheDocument();
      expect(within(popup).getByText(T.popup.selected(1))).toBeInTheDocument();
      fireEvent.change(within(popup).getByRole("searchbox"), {
        target: { value: "" },
      });
      fireEvent.click(
        within(popup).getByRole("tab", { name: T.popup.optionTab }),
      );
      check(popup, "시럽 추가");
      fireEvent.click(within(popup).getByRole("tab", { name: "커피" }));
      expect(
        within(popup).getByRole("checkbox", { name: "카페라떼" }),
      ).toBeChecked();
      expect(within(popup).getByText(T.popup.selected(2))).toBeInTheDocument();
    });

    it("카테고리를 넘나들며 고른 것을 한 번에 저장한다", async () => {
      const { popup, api } = await openPopup();
      const add = vi.spyOn(api, "add");
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      check(popup, "카페라떼");
      fireEvent.click(
        within(popup).getByRole("tab", { name: T.popup.optionTab }),
      );
      check(popup, "시럽 추가");
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      expect(await screen.findByText(T.popup.added(2))).toBeInTheDocument();
      expect([...add.mock.calls[0][0]].sort()).toEqual(["M002", "O002"]);
    });

    it("탭은 맨 앞 [전체], 맨 끝 [옵션]이고 옵션 탭에서도 등록된 항목은 막힌다", async () => {
      const { popup } = await openPopup();
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      const labels = within(popup)
        .getAllByRole("tab")
        .map((t) => t.textContent);
      expect(labels[0]).toBe(T.popup.allTab);
      expect(labels[labels.length - 1]).toBe(T.popup.optionTab);
      fireEvent.click(
        within(popup).getByRole("tab", { name: T.popup.optionTab }),
      );
      expect(
        within(popup).getByRole("checkbox", { name: "샷 추가" }),
      ).toBeDisabled();
    });

    it("추가가 시간 초과로 실패하면 서버 기준으로 목록을 다시 읽는다", async () => {
      const { popup, api } = await openPopup();
      const load = vi.spyOn(api, "loadList");
      vi.spyOn(api, "add").mockRejectedValue(new RequestTimeoutError());
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      check(popup, "카페라떼");
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    });

    it("서버가 체크한 것보다 적게 추가하면 건너뛴 개수를 함께 알린다", async () => {
      const { popup, api } = await openPopup();
      const original = api.add.bind(api);
      vi.spyOn(api, "add").mockImplementation((codes) =>
        original(codes.slice(0, 1)),
      );
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      check(popup, "카페라떼");
      check(popup, "스콘");
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      expect(
        await screen.findByText(T.popup.addedPartial(1, 1)),
      ).toBeInTheDocument();
      expect(within(popup).getByText(T.popup.selected(0))).toBeInTheDocument();
    });

    it("하나도 추가되지 않으면 「0개를 추가했습니다」 없이 건너뛴 개수만 알린다", async () => {
      const { popup, api } = await openPopup();
      vi.spyOn(api, "add").mockResolvedValue([]);
      const load = vi.spyOn(api, "loadList");
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      check(popup, "카페라떼");
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      expect(
        await screen.findByText(T.popup.allSkipped(1)),
      ).toBeInTheDocument();
      expect(screen.queryByText(T.popup.added(0))).toBeNull();
      expect(within(popup).getByText(T.popup.selected(0))).toBeInTheDocument();
      await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    });

    it("0개면 [추가하기]가 눌리지 않는다", async () => {
      const { popup } = await openPopup();
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      expect(
        within(popup).getByRole("button", { name: T.popup.submit }),
      ).toBeDisabled();
    });

    it("[추가하기]는 일시품절로 저장하고 팝업은 유지, 등록됨 · 0개 선택 · 뒤 목록 맨 위", async () => {
      const { popup } = await openPopup();
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      check(popup, "카페라떼");
      check(popup, "스콘");
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      expect(await screen.findByText(T.popup.added(2))).toBeInTheDocument();
      expect(
        screen.getByRole("dialog", { name: T.popup.title }),
      ).toBeInTheDocument();
      expect(
        within(popup).getByRole("checkbox", { name: "카페라떼" }),
      ).toBeDisabled();
      expect(
        within(popup).getByRole("checkbox", { name: "카페라떼" }),
      ).not.toBeChecked();
      expect(within(popup).getAllByText(T.popup.registered)).toHaveLength(4);
      expect(within(popup).getByText(T.popup.selected(0))).toBeInTheDocument();
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.close }),
      );
      expect(names().slice(0, 2).sort()).toEqual(["스콘", "카페라떼"]);
      expect(
        screen.getByRole("tab", { name: "일시품절 4" }),
      ).toBeInTheDocument();
    });

    it("추가가 실패하면 체크를 그대로 두고 실패 토스트를 보인다", async () => {
      const { popup } = await openPopup(["add"]);
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      check(popup, "카페라떼");
      fireEvent.click(
        within(popup).getByRole("button", { name: T.popup.submit }),
      );
      expect(await screen.findByText(T.saveFailed)).toBeInTheDocument();
      expect(
        within(popup).getByRole("checkbox", { name: "카페라떼" }),
      ).toBeChecked();
      expect(within(popup).getByText(T.popup.selected(1))).toBeInTheDocument();
    });

    it("[닫기] · Esc · 바깥 누르기로 닫히고, 다시 열면 검색 · 체크가 초기화된다", async () => {
      const { popup } = await openPopup();
      await within(popup).findByRole("checkbox", { name: "카페라떼" });
      check(popup, "카페라떼");
      fireEvent.change(within(popup).getByRole("searchbox"), {
        target: { value: "라떼" },
      });
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: T.add }));
      const again = await screen.findByRole("dialog", { name: T.popup.title });
      expect(await within(again).findByRole("searchbox")).toHaveValue("");
      expect(within(again).getByText(T.popup.selected(0))).toBeInTheDocument();
      fireEvent.click(again.parentElement!);
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: T.add }));
      fireEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: T.popup.close,
        }),
      );
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("상품 목록을 못 불러오면 팝업 안에서 [다시 시도]한다", async () => {
      const { popup, failures } = await openPopup(["loadCatalog"]);
      expect(
        await within(popup).findByText(T.popup.loadFailed),
      ).toBeInTheDocument();
      failures.clear();
      fireEvent.click(within(popup).getByRole("button", { name: T.retry }));
      expect(
        await within(popup).findByRole("checkbox", { name: "카페라떼" }),
      ).toBeInTheDocument();
    });
  });
});
