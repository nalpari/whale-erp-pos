// 개발 빌드 전용 모의 주문 버튼 묶음 (SPEC-order-sync 6장, 사용자 결정 D-1).
// App.tsx가 `import.meta.env.DEV`일 때만 이 파일을 불러온다. 운영 빌드에는 코드가 들어가지 않는다.
import { useState } from "react";
import type { MockOrderBackend } from "../../shared/api/orders";

interface Props {
  dev: MockOrderBackend["dev"];
}

export function DevMockPanel({ dev }: Props) {
  const [connected, setConnected] = useState(dev.isConnected());
  const buttons: Array<[string, () => void]> = [
    ["주문 1건", () => dev.addOrders(1)],
    ["주문 10건", () => dev.addOrders(10)],
    // 본 창을 최소화하거나 다른 창을 앞에 둘 시간을 준다 (위젯 시험, T06).
    ["5초 뒤 주문 1건", () => void setTimeout(() => dev.addOrders(1), 5000)],
    [
      "5초 뒤 주문 3건(같은 순간)",
      () => void setTimeout(() => dev.addOrders(3), 5000),
    ],
    ["고객 취소(가장 오래된 접수대기)", dev.customerCancelsOldestPending],
    ["가장 최근 취소 → 환불 완료", dev.refundLatestCancelled],
    ["다른 PC가 접수", dev.otherPcAcceptsOldestPending],
    [
      connected ? "연결 끊기" : "연결 잇기",
      () => {
        dev.setConnected(!connected);
        setConnected(!connected);
      },
    ],
    ["미접수 2건 자동 OFF", dev.triggerAutoOff],
    ["같은 주문 다시 보내기", dev.resendLastOrder],
    // 확인창 없이 바로 지운다 (개발용, T10 스펙 12장).
    ["전체 주문 삭제", dev.deleteAllOrders],
  ];
  return (
    <details className="fixed bottom-2 left-2 z-50 rounded bg-black/80 p-2 text-sm text-white">
      <summary className="cursor-pointer select-none">개발용 모의 주문</summary>
      <div className="mt-2 flex flex-col gap-1">
        {buttons.map(([label, onClick]) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="rounded bg-white/20 px-3 py-2 text-left"
          >
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}
