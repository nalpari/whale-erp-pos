import { describe, expect, it } from "vitest";
import { errorSummary } from "./error-summary";

describe("errorSummary", () => {
  it("오류 객체에 담긴 요청 본문(휴대폰 번호 등)은 남기지 않는다", () => {
    const error = Object.assign(new Error("요청 실패"), {
      config: { data: "01000000000" },
    });
    const summary = errorSummary(error);
    expect(summary).toEqual({ name: "Error", message: "요청 실패" });
    expect(JSON.stringify(summary)).not.toContain("01000000000");
  });

  it("Error가 아닌 값은 이름을 unknown으로 둔다", () => {
    expect(errorSummary("x")).toEqual({ name: "unknown", message: "x" });
  });
});
