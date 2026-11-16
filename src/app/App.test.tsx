import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("브라우저(비 Tauri)에서도 로그인 전 화면을 그린다", () => {
    render(<App />);

    expect(screen.getByText("픽업오더 주문접수")).toBeInTheDocument();
    expect(screen.getByText("로그인 후 이용해주세요.")).toBeInTheDocument();
  });
});
