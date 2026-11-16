import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("앱 제목을 보여 준다", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { level: 1, name: "픽업오더 주문접수" }),
    ).toBeInTheDocument();
  });
});
