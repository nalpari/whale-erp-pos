/** 탭과 탭 패널을 aria-controls · aria-labelledby로 잇기 위한 id. */
export function tabId(prefix: string, id: string) {
  return `${prefix}-tab-${id}`;
}

export function panelId(prefix: string, id: string) {
  return `${prefix}-panel-${id}`;
}
