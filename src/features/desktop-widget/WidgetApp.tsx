// 위젯 창이 열 때 그리는 최상위. 본 창이 보낸 화면을 받아 그리고, 보일지 · 크기는 창 쪽(WidgetClient)에 맡긴다.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { logInfo } from "../../shared/log/log";
import { logMessages } from "../../shared/log/log-messages";
import { startWithRetry } from "./retry";
import { WidgetScreen } from "./WidgetScreen";
import type { WidgetClient } from "./widget-host";
import { fitCount } from "./widget-logic";
import { WIDGET_MARGIN } from "./widget-position";
import { HIDDEN_VIEW, type WidgetView } from "./widget-protocol";

/** 위젯이 쓸 수 있는 높이(논리 px). 위젯은 늘 주 모니터에 있으므로 screen.availHeight(작업 영역 높이)로 대신하고 위아래 여백을 뺀다. 못 읽으면(0) 제한하지 않는다. */
function availableHeight(): number {
  const h = window.screen.availHeight;
  return h > 0 ? h - 2 * WIDGET_MARGIN : Infinity;
}

export function WidgetApp({ client }: { client: WidgetClient }) {
  const [view, setView] = useState<WidgetView>(HIDDEN_VIEW);
  const [viewFailed, setViewFailed] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const linkFailed = viewFailed || sendFailed;
  // 화면 높이에 맞춰 줄인 카드 수. 새 화면이 오면 전부 그려 본 뒤(null) 다시 잰다.
  const [fit, setFit] = useState<{
    view: WidgetView;
    linkFailed: boolean;
    limit: number | null;
  }>({ view, linkFailed: false, limit: null });
  // 안내 줄이 생기면 높이가 늘어나므로 그때도 다시 잰다.
  const limit =
    fit.view === view && fit.linkFailed === linkFailed ? fit.limit : null;
  const box = useRef<HTMLDivElement>(null);

  // 화면 받기 등록이 실패하면 다시 시도하고, 계속 실패하면 「본 화면에서 처리해 주세요」를 보인다 (A-2).
  useEffect(
    () =>
      startWithRetry(
        async () => {
          const off = await client.onView(setView);
          try {
            // 받을 준비가 된 뒤에 요청해야 본 창이 보낸 화면을 놓치지 않는다.
            await client.send({ type: "ready" });
          } catch (error) {
            off();
            throw error;
          }
          return off;
        },
        {
          onGiveUp: () => {
            void logInfo(logMessages.widgetFailed("view"));
            setViewFailed(true);
          },
          onRecovered: () => setViewFailed(false),
        },
      ),
    [client],
  );

  // 카드 수가 바뀌면 높이를 다시 재서 창 크기를 맞춘다 (높이는 카드에 맞춤, 3.1).
  // 화면 높이에 안 들어가면 카드를 줄이고 「+ N건」으로 센다 (3.3). 줄인 뒤 다시 그려지면 이 효과가 한 번 더 돈다.
  useLayoutEffect(() => {
    const el = box.current;
    if (el && limit === null && view.visible) {
      const heights = Array.from(
        el.querySelectorAll<HTMLElement>("[data-widget-card]"),
      ).map((c) => c.offsetHeight);
      const k = fitCount(
        heights,
        el.offsetHeight,
        availableHeight(),
        view.moreCount > 0,
      );
      if (k < heights.length) {
        // 잰 결과로 다시 그려야 하는 일이라 효과 안에서 상태를 바꾼다. 줄인 뒤에는 limit이 있어 되풀이되지 않는다.
        setFit({ view, linkFailed, limit: k });
        return;
      }
    }
    client
      // 연결이 실패했으면 카드가 없어도 안내만 띄운다.
      .present(view.visible || linkFailed, el?.offsetHeight ?? 0)
      .catch(() => void logInfo(logMessages.widgetFailed("present")));
  }, [client, view, limit, linkFailed]);

  return (
    <div ref={box}>
      <WidgetScreen
        view={view}
        limit={limit}
        linkFailed={linkFailed}
        onCommand={(c) => {
          // 화면을 못 받아 안내만 떠 있을 때는 [×]를 본 창에 보내도 숨김 화면이 오지 않는다. 여기서 접는다.
          if (c.type === "close-all" && viewFailed) {
            setViewFailed(false);
            return;
          }
          return client.send(c).then(
            () => setSendFailed(false),
            () => {
              void logInfo(logMessages.widgetFailed("send"));
              setSendFailed(true);
            },
          );
        }}
      />
    </div>
  );
}
