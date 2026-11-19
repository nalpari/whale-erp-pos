// 인기메뉴 순수 함수 (SPEC-settings-ai-popular 3 · 4 · 8장).
import { POPULAR_LIMIT, type PopularEntry } from "../../shared/api/popular";
import type { CatalogItem } from "../../shared/api/soldout";

/** 더 넣을 수 있는 자리. */
export const remainingSlots = (count: number) =>
  Math.max(POPULAR_LIMIT - count, 0);

/** 숨김 메뉴는 고를 수 없다. 일시품절은 고를 수 있다 (Q48 ③). */
export const canPick = (item: CatalogItem) => item.soldOutMode !== "hidden";

/** 먼저 추가한 것이 위. 시각이 같으면 받은 순서를 지킨다. */
export const sortOldestFirst = (entries: PopularEntry[]) =>
  [...entries].sort((a, b) => a.addedAt - b.addedAt);
