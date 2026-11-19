// 출력물을 "줄 목록"으로 나타낸다 (T12 스펙 2장). 화면(TS)이 줄 목록을 만들고 Rust(print_layout.rs)가 용지 폭에 맞춰
// 줄바꿈 · 장 나누기를 해서 그린다. 같은 줄 목록으로 영수증 미리보기도 그린다.
// 모양은 Rust의 PrintLine과 같다 (camelCase).
import type { PaperWidth } from "./printer-settings";

export interface PrintLine {
  text?: string;
  /** 같은 줄 오른쪽 끝에 붙는 글자(금액). 왼쪽 글자가 길면 왼쪽만 줄을 바꾼다. */
  right?: string;
  /** 글자 크기(포인트). 없으면 10. */
  size?: number;
  bold?: boolean;
  align?: "left" | "center" | "right";
  /** 참이면 글자 없이 가로 구분선 한 줄. */
  rule?: boolean;
}

export interface PrintDocument {
  /** Windows 인쇄 대기열에 보이는 문서 이름. 고객 · 주문 정보를 넣지 않는다. */
  docName: string;
  /** 슬롯의 용지 폭(T11). 이 폭에 맞춰 줄을 바꾼다. */
  paperWidth: PaperWidth;
  lines: PrintLine[];
}

export const RULE: PrintLine = { rule: true };
