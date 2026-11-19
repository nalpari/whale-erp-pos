// 줄 목록을 종이 모양으로 그린다 (영수증 미리보기 · 개발용 출력 미리보기). 1mm를 4px로 그려 80mm 용지가 320px이다.
// 실제 출력과 줄바꿈 위치는 조금 다를 수 있다(여기는 브라우저 글꼴, 출력은 프린터 해상도 기준).
import type { PrintLine } from "../../shared/printer/print-lines";
import type { PaperWidth } from "../../shared/printer/printer-settings";

const DEFAULT_PT = 10;

export function PaperPreview({
  lines,
  paperWidth,
}: {
  lines: PrintLine[];
  paperWidth: PaperWidth;
}) {
  return (
    <div
      className="bg-white p-3 text-black ring-1 ring-gray-300"
      style={{ width: paperWidth * 4 }}
    >
      {lines.map((line, i) =>
        line.rule ? (
          <hr key={i} className="my-1 border-t border-black" />
        ) : (
          <div
            key={i}
            className="flex justify-between gap-2 break-words whitespace-pre-wrap"
            style={{
              fontSize: ((line.size ?? DEFAULT_PT) * 4) / 3,
              fontWeight: line.bold ? 700 : 400,
              justifyContent:
                line.right !== undefined
                  ? "space-between"
                  : line.align === "center"
                    ? "center"
                    : line.align === "right"
                      ? "flex-end"
                      : "flex-start",
              lineHeight: 1.4,
            }}
          >
            <span>{line.text}</span>
            {line.right !== undefined && (
              <span className="shrink-0">{line.right}</span>
            )}
          </div>
        ),
      )}
    </div>
  );
}
