import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WIDGET_RETRY_MAX, WIDGET_RETRY_MS } from "./retry";
import { WidgetApp } from "./WidgetApp";
import type { WidgetClient } from "./widget-host";
import type { WidgetView } from "./widget-protocol";

function fakeClient() {
  let push: (v: WidgetView) => void = () => {};
  const client: WidgetClient = {
    onView: vi.fn(async (h) => {
      push = h;
      return () => {};
    }),
    send: vi.fn(async () => {}),
    present: vi.fn(async () => {}),
  };
  return { client, push: (v: WidgetView) => act(() => push(v)) };
}

describe("WidgetApp", () => {
  it("뜨면 본 창에 ready를 보내고, 받은 화면대로 창을 띄우거나 숨긴다", async () => {
    const { client, push } = fakeClient();
    render(<WidgetApp client={client} />);
    await act(async () => {});
    expect(client.send).toHaveBeenCalledWith({ type: "ready" });
    expect(client.present).toHaveBeenLastCalledWith(false, expect.any(Number));

    push({
      visible: true,
      autoOffCard: false,
      cards: [
        {
          orderId: "o1",
          pickupNumber: 3,
          status: "pending",
          paidAt: Date.now(),
          pickupChoice: "now",
          items: [{ name: "시험 메뉴", quantity: 1 }],
          busy: false,
        },
      ],
      moreCount: 0,
    });
    expect(screen.getByLabelText("픽업번호 3")).toBeInTheDocument();
    expect(client.present).toHaveBeenLastCalledWith(true, expect.any(Number));
  });

  it("화면 받기 등록이 계속 실패하면 다시 시도하다가 안내만 띄운다", async () => {
    vi.useFakeTimers();
    try {
      const client: WidgetClient = {
        onView: vi.fn(async () => {
          throw new Error("listen 실패");
        }),
        send: vi.fn(async () => {}),
        present: vi.fn(async () => {}),
      };
      render(<WidgetApp client={client} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          WIDGET_RETRY_MS * (WIDGET_RETRY_MAX + 1),
        );
      });
      expect(client.onView).toHaveBeenCalledTimes(WIDGET_RETRY_MAX + 1);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "본 화면에서 처리해 주세요",
      );
      expect(client.present).toHaveBeenLastCalledWith(true, expect.any(Number));

      // 화면을 못 받아 안내만 떠 있을 때는 [×]로 접을 수 있다.
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "위젯 닫기" }));
      });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(client.present).toHaveBeenLastCalledWith(
        false,
        expect.any(Number),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("동작 보내기가 실패하면 안내를 보이고, 다시 성공하면 지운다", async () => {
    const { client, push } = fakeClient();
    render(<WidgetApp client={client} />);
    await act(async () => {});
    push({
      visible: true,
      autoOffCard: false,
      cards: [
        {
          orderId: "o1",
          pickupNumber: 3,
          status: "pending",
          paidAt: Date.now(),
          pickupChoice: "now",
          items: [{ name: "시험 메뉴", quantity: 1 }],
          busy: false,
        },
      ],
      moreCount: 0,
    });
    vi.mocked(client.send).mockRejectedValueOnce(new Error("emit 실패"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "주문접수" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "본 화면에서 처리해 주세요",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "주문접수" }));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
