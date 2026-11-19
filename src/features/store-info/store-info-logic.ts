// 매장정보 입력 검사 순수 함수 (SPEC-store-info 3 · 4장). 화면과 서버를 모른다.
import type { StoreInfo } from "../../shared/api/store-info";
import { countChars } from "../order-summary/summary-logic";

export interface FieldLimit {
  chars: number;
  lines: number;
}
/** 칸 아래 안내 두 가지: 글자 수를 넘어 잘렸는지, 줄 수를 넘어 잘렸는지. */
export interface FieldNotice {
  tooLong: boolean;
  tooManyLines: boolean;
}
export const INTRO_LIMIT: FieldLimit = { chars: 100, lines: 3 };
export const NOTICE_LIMIT: FieldLimit = { chars: 200, lines: 5 };

const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });

const graphemes = (text: string) =>
  Array.from(segmenter.segment(text), (x) => x.segment);
const newlines = (text: string) => text.split("\n").length - 1;

/**
 * 새로 들어간 부분만 자른다: 한도를 넘으면 줄 수 → 글자 수 순서로 넘는 만큼 덜어낸다.
 * 끝에서 자르면 커서가 중간일 때 원래 있던 글이 지워지므로, 이전 값(prev)과 비교해 바뀐 가운데만 다룬다.
 * 이전 값이 없으면(한글 조합이 끝났을 때 등) 전체를 앞에서부터 센다.
 * shortcut: 앞뒤 공통 부분을 UTF-16 단위로 찾아, 한도 바로 앞에서 이모지를 끼워 넣으면 이모지가 쪼개질 수 있다. 실사용에서 보이면 글자(grapheme) 단위로 바꾼다.
 * 글자는 보이는 글자 하나를 1자로 세고(Q40) 줄바꿈도 1자다. maxLength 대신 직접 자르는 것은 그 기준이 브라우저 기본과 다르기 때문이다.
 */
export function clampField(
  raw: string,
  limit: FieldLimit,
  prev = "",
): { text: string } & FieldNotice {
  const value = raw.replace(/\r\n?/g, "\n");
  let start = 0;
  while (
    start < prev.length &&
    start < value.length &&
    prev[start] === value[start]
  ) {
    start += 1;
  }
  let tail = 0;
  while (
    tail < prev.length - start &&
    tail < value.length - start &&
    prev[prev.length - 1 - tail] === value[value.length - 1 - tail]
  ) {
    tail += 1;
  }
  const head = value.slice(0, start);
  const rest = value.slice(value.length - tail);
  let inserted = value.slice(start, value.length - tail);

  let tooManyLines = false;
  const extraLines = limit.lines - 1 - newlines(head + rest);
  if (newlines(inserted) > extraLines) {
    tooManyLines = true;
    inserted = inserted
      .split("\n")
      .slice(0, Math.max(extraLines, 0) + 1)
      .join("\n");
    if (extraLines < 0) inserted = "";
  }
  let tooLong = false;
  const room = Math.max(limit.chars - countChars(head + rest), 0);
  const chars = graphemes(inserted);
  if (chars.length > room) {
    tooLong = true;
    inserted = chars.slice(0, room).join("");
  }
  return { text: head + inserted + rest, tooLong, tooManyLines };
}

/** 점포 소개는 필수다. 공백뿐이어도 빈 것으로 본다. */
export function introMissing(intro: string): boolean {
  return intro.trim() === "";
}

/** 마지막으로 저장한 값과 다른지. 태그는 순서를 따지지 않는다. */
export function isDirty(saved: StoreInfo, draft: StoreInfo): boolean {
  const tags = (v: StoreInfo) => [...v.selectedTags].sort().join("\n");
  return (
    saved.intro !== draft.intro ||
    saved.notice !== draft.notice ||
    saved.noticeVisible !== draft.noticeVisible ||
    saved.tagsVisible !== draft.tagsVisible ||
    tags(saved) !== tags(draft)
  );
}
