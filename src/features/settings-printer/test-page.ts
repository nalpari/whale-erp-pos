// 시험 페이지에 찍을 줄 (스펙 2.3-2). 글자를 그리는 일은 Rust print_document가 한다.

const pad = (n: number) => String(n).padStart(2, "0");

function formatDateTime(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function buildTestPageLines(input: {
  printerName: string;
  purpose: string;
  storeName: string;
  now: Date;
}): string[] {
  const purpose = input.purpose.trim();
  return [
    "픽업오더 주문접수 시험 인쇄",
    `프린터: ${input.printerName}`,
    ...(purpose ? [`용도: ${purpose}`] : []),
    `점포: ${input.storeName}`,
    `출력 시각: ${formatDateTime(input.now)}`,
    "가나다라마바사 아메리카노 1잔",
    "0123456789",
  ];
}
