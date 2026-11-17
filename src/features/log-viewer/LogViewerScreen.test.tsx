import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LogApi } from "../../shared/log/log-api";
import { LogViewerScreen } from "./LogViewerScreen";

function api(overrides: Partial<LogApi> = {}): LogApi {
  return {
    readRecent: vi.fn(async () => ({
      path: "/home/u/logs",
      lines: ["첫 줄", "마지막 줄"],
    })),
    openDir: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("LogViewerScreen", () => {
  it("제목 · 경로 · 최근 로그를 보이고 200줄을 요청한다", async () => {
    const logApi = api();
    render(<LogViewerScreen logApi={logApi} onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "로그 확인" })).toBeTruthy();
    expect(await screen.findByText("로그 위치: /home/u/logs")).toBeTruthy();
    expect(screen.getByText(/마지막 줄/)).toBeTruthy();
    expect(logApi.readRecent).toHaveBeenCalledWith(200);
  });

  it("맨 아래로 스크롤한다", async () => {
    render(<LogViewerScreen logApi={api()} onClose={() => {}} />);
    const log = await screen.findByLabelText("최근 로그");
    Object.defineProperty(log, "scrollHeight", { value: 999 });
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await waitFor(() => expect(log.scrollTop).toBe(999));
  });

  it("로그가 없으면 안내 문구", async () => {
    const logApi = api({
      readRecent: async () => ({ path: "/p", lines: [] }),
    });
    render(<LogViewerScreen logApi={logApi} onClose={() => {}} />);
    expect(
      await screen.findByText("아직 기록된 로그가 없습니다."),
    ).toBeTruthy();
  });

  it("읽기 실패 문구, 새로고침으로 다시 읽는다", async () => {
    const readRecent = vi
      .fn()
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce({ path: "/p", lines: ["복구"] });
    render(<LogViewerScreen logApi={api({ readRecent })} onClose={() => {}} />);
    expect(await screen.findByText("로그를 불러올 수 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect(await screen.findByText(/복구/)).toBeTruthy();
    expect(screen.queryByText("로그를 불러올 수 없습니다.")).toBeNull();
    expect(readRecent).toHaveBeenCalledTimes(2);
  });

  it("[로그 폴더 열기]는 폴더를 열고, 실패하면 문구", async () => {
    const openDir = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("x"));
    render(<LogViewerScreen logApi={api({ openDir })} onClose={() => {}} />);
    await screen.findByText("로그 위치: /home/u/logs");
    fireEvent.click(screen.getByRole("button", { name: "로그 폴더 열기" }));
    await waitFor(() => expect(openDir).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("로그 폴더를 열 수 없습니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "로그 폴더 열기" }));
    expect(await screen.findByText("로그 폴더를 열 수 없습니다.")).toBeTruthy();
  });

  it("[닫기]는 onClose를 부른다", async () => {
    const onClose = vi.fn();
    render(<LogViewerScreen logApi={api()} onClose={onClose} />);
    await screen.findByText("로그 위치: /home/u/logs");
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
