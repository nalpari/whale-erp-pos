import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersContext } from "../../shared/orders/orders-context";
import type { OrdersContextValue } from "../../shared/orders/orders-context";
import type { SoundPlayer } from "../../shared/sound/sound-player";
import { WidgetSettingsProvider } from "./WidgetSettingsContext";
import { WidgetSettingsScreen } from "./WidgetSettingsScreen";

function setup() {
  const sound: SoundPlayer = {
    playNewOrder: vi.fn(),
    playWarning: vi.fn(),
    setVolume: vi.fn(),
  };
  const ui = (
    <WidgetSettingsProvider sound={sound}>
      <OrdersContext.Provider value={{ sound } as OrdersContextValue}>
        <WidgetSettingsScreen />
      </OrdersContext.Provider>
    </WidgetSettingsProvider>
  );
  return { sound, ...render(ui), ui };
}

describe("위젯설정 화면", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("제목과 기본값(접수대기 막힘 · 제조중 · 제조완료 체크, 우하단, 40)을 보인다", () => {
    setup();
    expect(
      screen.getByText("바탕화면에 주문 알림 위젯을 표시합니다."),
    ).toBeInTheDocument();
    const pending = screen.getByRole("checkbox", { name: /접수대기/ });
    expect(pending).toBeChecked();
    expect(pending).toBeDisabled();
    expect(screen.getByText("항상 표시")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "제조중" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "제조완료" })).toBeChecked();
    expect(screen.queryByText("픽업완료")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "우하단" })).toBeChecked();
    expect(screen.getByRole("slider")).toHaveValue("40");
  });

  it("체크를 바꾸면 바로 저장하고 「저장되었습니다」를 보이고, 다시 열면 유지된다", () => {
    const { unmount, ui } = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: "제조중" }));
    expect(screen.getByText("저장되었습니다")).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem("widgetSettings") ?? "{}"),
    ).toMatchObject({ showPreparing: false });
    unmount();
    render(ui);
    expect(screen.getByRole("checkbox", { name: "제조중" })).not.toBeChecked();
  });

  it("위치를 고르면 미리보기 카드가 그 모서리로 옮겨 가고 저장된다", () => {
    setup();
    fireEvent.click(screen.getByRole("radio", { name: "좌상단" }));
    expect(screen.getByTestId("widget-preview-box")).toHaveAttribute(
      "data-position",
      "top-left",
    );
    expect(screen.getByTestId("widget-preview-card").className).toContain(
      "left-2 top-2",
    );
    expect(localStorage.getItem("widgetSettings")).toContain("top-left");
  });

  it("미리보기 < >로 접수대기 · 제조중 · 제조완료 예시를 넘긴다", () => {
    setup();
    const card = () => within(screen.getByTestId("widget-preview-card"));
    expect(card().getByText(/접수대기/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 예시" }));
    expect(card().getByText(/제조중/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 예시" }));
    expect(card().getByText(/제조완료/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전 예시" }));
    expect(card().getByText(/제조중/)).toBeInTheDocument();
  });

  it("끈 상태의 예시를 넘기면 「위젯에 표시 안 함」을 같이 보인다", () => {
    setup();
    const next = () =>
      fireEvent.click(screen.getByRole("button", { name: "다음 예시" }));
    expect(screen.queryByText("위젯에 표시 안 함")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "제조중" }));
    next(); // 제조중 예시
    expect(screen.getByText("위젯에 표시 안 함")).toBeInTheDocument();
    next(); // 제조완료 예시: 아직 켜져 있다
    expect(screen.queryByText("위젯에 표시 안 함")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "제조완료" }));
    expect(screen.getByText("위젯에 표시 안 함")).toBeInTheDocument();
    next(); // 접수대기 예시는 늘 표시
    expect(screen.queryByText("위젯에 표시 안 함")).not.toBeInTheDocument();
  });

  it("슬라이더는 20~100, 10 단위이고 값을 숫자로 보이며 재생기에 알린다", () => {
    const { sound } = setup();
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "20");
    expect(slider).toHaveAttribute("max", "100");
    expect(slider).toHaveAttribute("step", "10");
    fireEvent.change(slider, { target: { value: "80" } });
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(sound.setVolume).toHaveBeenLastCalledWith(80);
  });

  it("미리듣기는 지금 크기를 재생기에 알린 뒤 소리를 낸다", () => {
    const { sound } = setup();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "새 주문 미리듣기" }));
    fireEvent.click(screen.getByRole("button", { name: "경고 미리듣기" }));
    expect(sound.setVolume).toHaveBeenLastCalledWith(100);
    expect(sound.playNewOrder).toHaveBeenCalledTimes(1);
    expect(sound.playWarning).toHaveBeenCalledTimes(1);
  });

  it("저장소가 막혀 있으면 저장 실패 문구를 보이고 토스트는 없다", () => {
    setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "제조완료" }));
    expect(screen.getByRole("alert")).toHaveTextContent("저장하지 못했습니다");
    expect(screen.queryByText("저장되었습니다")).not.toBeInTheDocument();
  });
});
