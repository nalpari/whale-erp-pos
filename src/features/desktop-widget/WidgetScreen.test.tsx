import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTO_OFF_BANNER } from "../../shared/orders/order-texts";
import { WidgetScreen } from "./WidgetScreen";
import type { WidgetCardView, WidgetView } from "./widget-protocol";

function card(patch: Partial<WidgetCardView> = {}): WidgetCardView {
  return {
    orderId: "o1",
    pickupNumber: 12,
    status: "pending",
    paidAt: new Date(2026, 10, 19, 13, 21).getTime(),
    arrivalAt: new Date(2026, 10, 19, 13, 36).getTime(),
    items: [{ name: "아이스 아메리카노(시험)", quantity: 2 }],
    busy: false,
    ...patch,
  };
}
const view = (patch: Partial<WidgetView> = {}): WidgetView => ({
  visible: true,
  autoOffCard: false,
  cards: [card()],
  moreCount: 0,
  ...patch,
});

function setup(v: WidgetView) {
  const onCommand = vi.fn();
  render(<WidgetScreen view={v} onCommand={onCommand} />);
  return onCommand;
}

describe("WidgetScreen", () => {
  afterEach(() => vi.useRealTimers());

  it("도착 시각: 도착 전 「N분 뒤」, 지나면 빨간 「N분 지남」 (12장)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 19, 13, 30));
    setup(view());
    const c = screen.getByLabelText("픽업번호 12");
    expect(c).toHaveTextContent("13:36 도착 (6분 뒤)");
    vi.setSystemTime(new Date(2026, 10, 19, 13, 40));
    cleanup();
    setup(view());
    expect(screen.getByText("4분 지남")).toHaveClass("text-red-600");
  });

  it("주문서 출력에 실패한 카드에만 「미출력」 꼬리표를 보인다 (T12)", () => {
    setup(
      view({
        cards: [
          card({ orderId: "a", pickupNumber: 1, unprinted: true }),
          card({ orderId: "b", pickupNumber: 2 }),
        ],
      }),
    );
    const [first, second] = screen.getAllByRole("article");
    expect(within(first).getByText("미출력")).toBeInTheDocument();
    expect(within(second).queryByText("미출력")).toBeNull();
  });

  it("접수대기 카드는 시간 · 번호 · 메뉴와 [주문취소] [주문접수]를 보인다", () => {
    setup(
      view({
        cards: [
          card({
            note: "얼음 조금만",
            items: [
              { name: "가", quantity: 1 },
              { name: "나", quantity: 1 },
              { name: "다", quantity: 1 },
            ],
          }),
        ],
      }),
    );
    const c = screen.getByLabelText("픽업번호 12");
    expect(c).toHaveTextContent("접수대기");
    expect(c).toHaveTextContent("주문시간 13:21 | 13:36 도착");
    expect(c).toHaveTextContent("#12");
    expect(c).toHaveTextContent("얼음 조금만");
    expect(c).toHaveTextContent("+ 외 1개");
    expect(within(c).getByRole("button", { name: "주문취소" })).toBeVisible();
    expect(within(c).getByRole("button", { name: "주문접수" })).toBeVisible();
    expect(screen.getByText("새 주문 알림")).toBeVisible();
  });

  it("제조중은 [제조완료], 제조완료는 [픽업완료]만 있고 인쇄 버튼은 없다", () => {
    setup(
      view({
        cards: [
          card({ orderId: "a", pickupNumber: 1, status: "preparing" }),
          card({ orderId: "b", pickupNumber: 2, status: "ready" }),
        ],
      }),
    );
    const a = screen.getByLabelText("픽업번호 1");
    expect(
      within(a)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["×", "제조완료"]);
    const b = screen.getByLabelText("픽업번호 2");
    expect(within(b).getByRole("button", { name: "픽업완료" })).toBeVisible();
    expect(screen.queryByText(/인쇄/)).toBeNull();
  });

  it("버튼은 본 창으로 동작을 돌려보내고 카드 누름(열기)과 겹치지 않는다", () => {
    const onCommand = setup(view());
    fireEvent.click(screen.getByRole("button", { name: "주문접수" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "action",
      orderId: "o1",
      action: "accept",
    });
    fireEvent.click(screen.getByRole("button", { name: "주문취소" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "cancel",
      orderId: "o1",
    });
    expect(onCommand).toHaveBeenCalledTimes(2); // 카드 열기가 끼어들지 않았다
    fireEvent.click(screen.getByLabelText("픽업번호 12"));
    expect(onCommand).toHaveBeenLastCalledWith({ type: "open", orderId: "o1" });
  });

  it("카드 [×] · 머리 [×]", () => {
    const onCommand = setup(view());
    fireEvent.click(screen.getByRole("button", { name: "이 주문 닫기" }));
    expect(onCommand).toHaveBeenLastCalledWith({
      type: "close-card",
      orderId: "o1",
    });
    fireEvent.click(screen.getByRole("button", { name: "위젯 닫기" }));
    expect(onCommand).toHaveBeenLastCalledWith({ type: "close-all" });
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("요청 중에는 그 카드 버튼을 막고, 실패 문구를 카드 안에 보인다", () => {
    setup(
      view({
        cards: [card({ busy: true, failure: "#12 처리하지 못했습니다." })],
      }),
    );
    expect(screen.getByRole("button", { name: "처리 중…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "주문취소" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "#12 처리하지 못했습니다.",
    );
  });

  it("「+ N건 더 있음」을 누르면 more 동작을 보낸다", () => {
    const onCommand = setup(view({ moreCount: 3 }));
    fireEvent.click(screen.getByRole("button", { name: "+ 3건 더 있음" }));
    expect(onCommand).toHaveBeenCalledWith({ type: "more" });
  });

  it("픽업완료 카드는 [완료 취소(05)]를 보이고 누르면 되돌린다", () => {
    const onCommand = setup(
      view({
        cards: [
          card({ status: "picked-up", undoExpiresAt: Date.now() + 5000 }),
        ],
      }),
    );
    const undo = screen.getByRole("button", { name: "완료 취소(05)" });
    fireEvent.click(undo);
    expect(onCommand).toHaveBeenCalledWith({
      type: "action",
      orderId: "o1",
      action: "undo-pickup",
    });
  });

  it("자동 OFF 안내 카드는 맨 위에 문구를 보이고, 누르면 본 창 · [×]는 닫기", () => {
    const onCommand = setup(view({ autoOffCard: true }));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(AUTO_OFF_BANNER);
    fireEvent.click(alert);
    expect(onCommand).toHaveBeenLastCalledWith({ type: "auto-off-open" });
    fireEvent.click(within(alert).getByRole("button"));
    expect(onCommand).toHaveBeenLastCalledWith({ type: "auto-off-close" });
    expect(onCommand).toHaveBeenCalledTimes(2);
  });

  it("limit보다 많은 카드는 못 그리고 「+ N건」에 더한다 (화면 높이)", () => {
    const three = [
      card({ orderId: "a", pickupNumber: 1 }),
      card({ orderId: "b", pickupNumber: 2 }),
      card({ orderId: "c", pickupNumber: 3 }),
    ];
    render(
      <WidgetScreen
        view={view({ cards: three, moreCount: 1 })}
        limit={2}
        onCommand={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "+ 2건 더 있음" })).toBeVisible();
  });

  it("자동 OFF 카드는 주문 카드보다 위에 있다", () => {
    setup(view({ autoOffCard: true }));
    const alert = screen.getByRole("alert");
    const first = screen.getByLabelText("픽업번호 12");
    expect(
      alert.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("본 창이 알린 연결 실패(linkFailed)도 안내를 보인다", () => {
    setup(view({ linkFailed: true }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "본 화면에서 처리해 주세요",
    );
  });
});
