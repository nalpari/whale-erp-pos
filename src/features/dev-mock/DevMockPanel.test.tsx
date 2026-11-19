import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockOrderBackend } from "../../shared/api/orders";
import { DevMockPanel } from "./DevMockPanel";

describe("DevMockPanel", () => {
  it("스펙 6장의 버튼이 모두 있고 누르면 모의 서버 동작을 부른다", () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    const spies = {
      add: vi.spyOn(backend.dev, "addOrders"),
      cancel: vi.spyOn(backend.dev, "customerCancelsOldestPending"),
      other: vi.spyOn(backend.dev, "otherPcAcceptsOldestPending"),
      off: vi.spyOn(backend.dev, "triggerAutoOff"),
      resend: vi.spyOn(backend.dev, "resendLastOrder"),
    };
    render(<DevMockPanel dev={backend.dev} />);

    fireEvent.click(screen.getByRole("button", { name: "주문 1건" }));
    fireEvent.click(screen.getByRole("button", { name: "주문 10건" }));
    fireEvent.click(
      screen.getByRole("button", { name: "고객 취소(가장 오래된 접수대기)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "다른 PC가 접수" }));
    fireEvent.click(
      screen.getByRole("button", { name: "미접수 2건 자동 OFF" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "같은 주문 다시 보내기" }),
    );

    expect(spies.add.mock.calls).toEqual([[1], [10]]);
    expect(spies.cancel).toHaveBeenCalledTimes(1);
    expect(spies.other).toHaveBeenCalledTimes(1);
    expect(spies.off).toHaveBeenCalledTimes(1);
    expect(spies.resend).toHaveBeenCalledTimes(1);
  });

  it("[연결 끊기 / 잇기]는 누를 때마다 서로 바뀐다", () => {
    const backend = createMockOrderBackend({ delayMs: 0 });
    render(<DevMockPanel dev={backend.dev} />);

    fireEvent.click(screen.getByRole("button", { name: "연결 끊기" }));
    expect(backend.dev.isConnected()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "연결 잇기" }));
    expect(backend.dev.isConnected()).toBe(true);
  });

  it("「5초 뒤 주문」은 5초가 지나야 주문을 만든다 (본 창을 최소화할 시간, T06)", () => {
    vi.useFakeTimers();
    try {
      const backend = createMockOrderBackend({ delayMs: 0 });
      const add = vi.spyOn(backend.dev, "addOrders");
      render(<DevMockPanel dev={backend.dev} />);
      fireEvent.click(screen.getByRole("button", { name: "5초 뒤 주문 1건" }));
      fireEvent.click(
        screen.getByRole("button", { name: "5초 뒤 주문 3건(같은 순간)" }),
      );
      expect(add).not.toHaveBeenCalled();
      vi.advanceTimersByTime(5000);
      expect(add).toHaveBeenNthCalledWith(1, 1);
      expect(add).toHaveBeenNthCalledWith(2, 3);
    } finally {
      vi.useRealTimers();
    }
  });
});
