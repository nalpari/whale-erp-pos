import { describe, expect, it } from "vitest";
import { createMockPopularApi, POPULAR_LIMIT } from "./popular";
import { createMockSoldOutApi } from "./soldout";

const make = () =>
  createMockPopularApi(createMockSoldOutApi({ delayMs: 0 }), { delayMs: 0 });

describe("createMockPopularApi.add", () => {
  it("숨김 · 이미 등록된 코드는 무시하고 한도까지만 추가한다", async () => {
    const api = make();
    // M015 숨김, M001 이미 등록, M003~M005 새 코드 3개 중 남은 자리는 3개
    const added = await api.add([
      "M015",
      "M001",
      "M003",
      "M004",
      "M005",
      "M006",
    ]);
    expect(added.map((e) => e.code)).toEqual(["M003", "M004", "M005"]);
    expect((await api.loadList()).length).toBe(POPULAR_LIMIT);
    expect(await api.add(["M006"])).toEqual([]);
  });

  it("옵션 코드는 추가되지 않는다", async () => {
    expect(await make().add(["O001"])).toEqual([]);
  });
});
