// 메뉴품절 화면 테스트용 래퍼. 실제로는 MainContent가 들고 있는 검색어 상태를 대신 들고 있는다.
import { useState } from "react";
import type { SoldOutApi } from "../shared/api/soldout";
import { SoldOutScreen } from "../features/soldout/SoldOutScreen";

export function SoldOutHarness({
  api,
  refreshSeq,
}: {
  api: SoldOutApi;
  refreshSeq: number;
}) {
  const [query, setQuery] = useState("");
  return (
    <SoldOutScreen
      api={api}
      refreshSeq={refreshSeq}
      onBusyChange={() => {}}
      query={query}
      onQueryChange={setQuery}
    />
  );
}
