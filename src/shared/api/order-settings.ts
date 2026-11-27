// 점포 주문설정 API (SPEC-settings-order 4 · 7장). 백엔드 API가 정해지기 전이라 인터페이스와 모의 구현만 둔다 (가정).
// 칸 이름과 요청 · 응답 형태는 가정이다. 백엔드 요청 문서(점포 주문 설정 API 추가)와 맞추고, 협의 뒤 이 파일만 바꾼다.

/** 두 값 모두 고를 수 있는 분 (스펙 3장, 13장 A). */
export const ORDER_SETTING_MINUTES = [5, 10, 15, 20, 25, 30] as const;
export type OrderSettingMinutes = (typeof ORDER_SETTING_MINUTES)[number];

export interface OrderSettings {
  /** 미접수 자동 취소 시간(분). 서버가 이 시간으로 접수대기 주문을 취소한다. */
  autoCancelMinutes: OrderSettingMinutes;
  /** 고객이 고를 수 있는 가장 빠른 도착 시간(분). 고객 앱이 쓴다. */
  arrivalMinMinutes: OrderSettingMinutes;
}

export const DEFAULT_ORDER_SETTINGS: Readonly<OrderSettings> = {
  autoCancelMinutes: 15,
  arrivalMinMinutes: 5,
};

export interface OrderSettingsApi {
  /** 실패하면 예외를 던진다. 10초 제한은 부르는 쪽(withTimeout)이 건다. */
  load(): Promise<OrderSettings>;
  /** 실패하면 예외를 던진다. 제한 시간이 지나도 서버에는 반영됐을 수 있다(늦은 응답은 버려진다). */
  save(settings: OrderSettings): Promise<void>;
}

export interface MockOrderSettingsOptions {
  /** 응답까지 걸리는 시간. 기본 300ms. */
  delayMs?: number;
  /** true면 그 요청을 실패시킨다. */
  shouldFail?: (kind: "load" | "save") => boolean;
}

/** 모의 구현. current()는 모의 주문 서버가 새 주문의 autoCancelAt을 채울 때 쓴다(서버 안에서 같은 값을 본다). */
export function createMockOrderSettingsApi(
  options: MockOrderSettingsOptions = {},
): OrderSettingsApi & { current(): OrderSettings } {
  const { delayMs = 300, shouldFail = () => false } = options;
  let stored: OrderSettings = { ...DEFAULT_ORDER_SETTINGS };
  const reply = <T>(kind: "load" | "save", value: () => T) =>
    new Promise<T>((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail(kind)) reject(new Error("모의 서버 요청 실패"));
        else resolve(value());
      }, delayMs);
    });
  return {
    load: () => reply("load", () => ({ ...stored })),
    save: (settings) =>
      reply("save", () => {
        stored = { ...settings };
      }),
    current: () => ({ ...stored }),
  };
}
