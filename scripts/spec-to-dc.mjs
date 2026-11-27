// docs/specs/*.md → 명세 보관소(whalepos) 「문서」 DC 항목용 HTML.
// 마크다운 원문을 그대로 넣고 브라우저에서 marked로 그린다(명세 보관소에 변환 도구가 없어서).
// 사용: node scripts/spec-to-dc.mjs docs/specs <출력 폴더>
// 출력 HTML을 spec_propose의 html로 넣어 아래 DC id 항목을 고친다(AGENTS.md 오케스트레이션 8단계).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// 스펙 파일 → 명세 보관소 DC id (2026-11-24 등록). 새 스펙이면 DC-SP + 영문 4자로 새 id를 정해 여기에 더한다.
const DC_IDS = {
  "README.md": "DC-SPLIST",
  "SPEC-app-shell.md": "DC-SPSHEL",
  "SPEC-login.md": "DC-SPLOGN",
  "SPEC-settings-printer.md": "DC-SPPRST",
  "SPEC-logging.md": "DC-SPLOGS",
  "SPEC-order-sync.md": "DC-SPOSYN",
  "SPEC-order-board.md": "DC-SPOBRD",
  "SPEC-order-summary.md": "DC-SPOSUM",
  "SPEC-desktop-widget.md": "DC-SPWDGT",
  "SPEC-settings-widget.md": "DC-SPWSET",
  "SPEC-order-history.md": "DC-SPHIST",
  "SPEC-store-info.md": "DC-SPSTRI",
  "SPEC-soldout.md": "DC-SPSOLD",
  "SPEC-settings-ai-popular.md": "DC-SPAIPM",
  "SPEC-print-forms.md": "DC-SPPRFM",
  "SPEC-remake.md": "DC-SPRMKE",
  "SPEC-settings-order.md": "DC-SPOSET",
};

const [, , specDir, outDir] = process.argv;
if (!specDir || !outDir) {
  console.error("사용: node scripts/spec-to-dc.mjs docs/specs <출력 폴더>");
  process.exit(1);
}

const page = (title, md) => {
  if (md.includes("</script")) throw new Error(`${title}: </script 포함`);
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{--bg:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--code:#f6f8fa}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--code:#151b23}}
:root[data-theme="dark"]{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--code:#151b23}
body{background:var(--bg);color:var(--fg);font:15px/1.65 -apple-system,"Segoe UI","Noto Sans KR",sans-serif;margin:0;padding:24px 16px}
main{max-width:900px;margin:0 auto}
h1,h2,h3{line-height:1.3;margin:1.6em 0 .6em}h1{font-size:1.6em}h2{font-size:1.3em;border-bottom:1px solid var(--line);padding-bottom:.3em}
table{border-collapse:collapse;display:block;overflow-x:auto;margin:1em 0}th,td{border:1px solid var(--line);padding:6px 10px;vertical-align:top}
code{background:var(--code);padding:.1em .3em;border-radius:4px;font-size:.9em}pre{background:var(--code);padding:12px;overflow-x:auto;border-radius:6px}pre code{padding:0}
blockquote{color:var(--muted);border-left:4px solid var(--line);margin:0;padding:0 1em}
.note{color:var(--muted);font-size:.9em;border:1px solid var(--line);border-radius:6px;padding:8px 12px}
</style></head><body><main>
<p class="note">개발 저장소 docs/specs 사본. 원본은 저장소에 있고 태스크를 머지할 때마다 같이 고친다.</p>
<div id="doc">불러오는 중…</div>
</main>
<script type="text/markdown" id="md">
${md}
</script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script>
var el=document.getElementById("doc");
try{el.innerHTML=marked.parse(document.getElementById("md").textContent);}
catch(e){el.textContent=document.getElementById("md").textContent;el.style.whiteSpace="pre-wrap";}
</script>
</body></html>
`;
};

for (const f of readdirSync(specDir).filter((n) => n.endsWith(".md"))) {
  const md = readFileSync(join(specDir, f), "utf8");
  const title = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).replace(/`/g, "");
  writeFileSync(join(outDir, f.replace(/\.md$/, ".html")), page(title, md));
  console.log(f, "→", DC_IDS[f] ?? "DC id 없음(새로 정할 것)", title);
}
