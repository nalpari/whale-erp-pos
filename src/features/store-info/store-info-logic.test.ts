import { describe, expect, it } from "vitest";
import type { StoreInfo } from "../../shared/api/store-info";
import {
  clampField,
  INTRO_LIMIT,
  introMissing,
  isDirty,
  NOTICE_LIMIT,
} from "./store-info-logic";

const base: StoreInfo = {
  intro: "소개",
  notice: "공지",
  noticeVisible: true,
  tagsVisible: true,
  selectedTags: ["a", "b"],
};

describe("clampField", () => {
  it("한도 안이면 그대로 둔다", () => {
    expect(clampField("가나다\n라마", INTRO_LIMIT)).toEqual({
      text: "가나다\n라마",
      tooLong: false,
      tooManyLines: false,
    });
  });

  it("글자 수는 보이는 글자 하나를 1자로 센다 (이모지 · 줄바꿈 포함)", () => {
    const text = "👨‍👩‍👧".repeat(49) + "\n";
    expect(clampField(text, INTRO_LIMIT).tooLong).toBe(false);
    const over = clampField("👨‍👩‍👧".repeat(101), INTRO_LIMIT);
    expect(over.tooLong).toBe(true);
    expect([...new Intl.Segmenter().segment(over.text)]).toHaveLength(100);
  });

  it("100자를 넘게 붙여 넣으면 넘는 부분을 자른다", () => {
    const r = clampField("가".repeat(150), INTRO_LIMIT);
    expect(r.text).toBe("가".repeat(100));
    expect(r.tooLong).toBe(true);
    expect(r.tooManyLines).toBe(false);
  });

  it("200자 한도는 공지에 쓴다", () => {
    expect(clampField("가".repeat(201), NOTICE_LIMIT).text).toHaveLength(200);
  });

  it("소개는 3줄, 공지는 5줄까지만 남긴다", () => {
    const a = clampField("1\n2\n3\n4", INTRO_LIMIT);
    expect(a.text).toBe("1\n2\n3");
    expect(a.tooManyLines).toBe(true);
    const b = clampField("1\n2\n3\n4\n5\n6", NOTICE_LIMIT);
    expect(b.text).toBe("1\n2\n3\n4\n5");
    expect(b.tooManyLines).toBe(true);
  });

  it("줄바꿈 \\r\\n은 한 글자 한 줄로 센다", () => {
    expect(clampField("1\r\n2\r\n3", INTRO_LIMIT)).toEqual({
      text: "1\n2\n3",
      tooLong: false,
      tooManyLines: false,
    });
  });

  it("글자 수와 줄 수를 같이 넘기면 둘 다 알린다", () => {
    const r = clampField("가".repeat(60) + "\n" + "나".repeat(60) + "\n\n\n", {
      chars: 100,
      lines: 3,
    });
    expect(r.tooLong).toBe(true);
    expect(r.tooManyLines).toBe(true);
  });
});

describe("clampField: 중간에 넣을 때 원래 글을 지키고 새로 넣은 부분만 자른다", () => {
  it("3줄이 찬 소개 중간에서 Enter를 눌러도 원래 줄이 사라지지 않는다", () => {
    const prev = "가나\n다라\n마바";
    const r = clampField("가\n나\n다라\n마바", INTRO_LIMIT, prev);
    expect(r).toEqual({ text: prev, tooLong: false, tooManyLines: true });
  });

  it("100자가 찬 소개 맨 앞에 붙여 넣으면 원래 글을 지키고 붙인 글은 들어갈 만큼도 안 들어간다", () => {
    const prev = "가".repeat(100);
    const r = clampField("ABC" + prev, INTRO_LIMIT, prev);
    expect(r.text).toBe(prev);
    expect(r.tooLong).toBe(true);
  });

  it("남은 자리만큼만 붙여 넣는다", () => {
    const prev = "가".repeat(98);
    const r = clampField(
      "가".repeat(40) + "ABCD" + "가".repeat(58),
      INTRO_LIMIT,
      prev,
    );
    expect(r.text).toBe("가".repeat(40) + "AB" + "가".repeat(58));
    expect(r.tooLong).toBe(true);
  });
});

describe("introMissing", () => {
  it("비었거나 공백뿐이면 비었다", () => {
    expect(introMissing("")).toBe(true);
    expect(introMissing(" \n ")).toBe(true);
    expect(introMissing("a")).toBe(false);
  });
});

describe("isDirty", () => {
  it("같으면 바뀌지 않은 것이다 (태그 순서는 무관)", () => {
    expect(isDirty(base, { ...base, selectedTags: ["b", "a"] })).toBe(false);
  });

  it.each([
    { intro: "다름" },
    { notice: "다름" },
    { noticeVisible: false },
    { tagsVisible: false },
    { selectedTags: ["a"] },
  ])("%o 이 바뀌면 바뀐 것이다", (patch) => {
    expect(isDirty(base, { ...base, ...patch })).toBe(true);
  });
});
