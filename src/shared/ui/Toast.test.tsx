import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toast, TOAST_DURATION_MS } from "./Toast";

describe("Toast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("role=status로 문구를 보이고 닫기 버튼은 없다", () => {
    render(<Toast message="저장되었습니다" onClose={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("저장되었습니다");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("2초 전에 사라지면 onClose를 부르지 않는다", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Toast message="저장되었습니다" onClose={onClose} />,
    );
    unmount();
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS * 2));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("2초 뒤 onClose를 부른다", () => {
    const onClose = vi.fn();
    render(<Toast message="저장되었습니다" onClose={onClose} />);
    act(() => vi.advanceTimersByTime(TOAST_DURATION_MS - 1));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
