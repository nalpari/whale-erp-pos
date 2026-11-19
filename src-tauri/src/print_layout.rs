//! 줄 목록을 용지 폭에 맞춰 줄바꿈하고 장으로 나누는 계산 (T12 스펙 2장).
//! 글자 폭 재기는 부르는 쪽이 넘기는 함수(measure)가 한다: Windows는 GDI 글꼴로 재고, 테스트는 가짜 폭을 쓴다.
//! 그래서 이 파일은 OS와 상관없이 테스트할 수 있다. 그리는 일은 printer.rs의 Windows 코드가 한다.
// Windows가 아니면 그리는 쪽(imp)이 layout · wrap_text · Row를 쓰지 않아 dead_code 경고가 난다. 테스트는 모든 OS에서 돈다.
#![cfg_attr(not(windows), allow(dead_code))]

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    #[default]
    Left,
    Center,
    Right,
}

/// 화면(TS)이 만들어 보내는 한 줄. 모양은 src/shared/printer/print-lines.ts와 같다.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PrintLine {
    pub text: String,
    /// 같은 줄 오른쪽 끝에 붙는 글자(금액). 왼쪽 글자가 길면 왼쪽만 줄을 바꾼다.
    pub right: Option<String>,
    /// 글자 크기(포인트). 없으면 DEFAULT_PT.
    pub size: Option<u32>,
    pub bold: bool,
    pub align: Align,
    /// 참이면 글자 없이 가로 구분선 한 줄.
    pub rule: bool,
}

pub const DEFAULT_PT: u32 = 10;
const MIN_PT: u32 = 6;
const MAX_PT: u32 = 72;

/// 줄바꿈이 끝나 그릴 준비가 된 한 줄. y는 장 위쪽(여백 안쪽)에서 잰 점 단위다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Row {
    pub text: String,
    pub right: Option<String>,
    pub pt: u32,
    pub bold: bool,
    pub align: Align,
    pub rule: bool,
    pub y: i32,
    pub height: i32,
}

pub type Page = Vec<Row>;

/// text를 max_w 안에 들어가게 줄바꿈한다. 공백이 있으면 거기서 바꾸고(영어 단어를 자르지 않으려고),
/// 공백이 없으면(한글 · 아주 긴 단어) 글자 단위로 자른다. `\n`은 강제 줄바꿈이다.
/// 글자 하나가 max_w보다 넓어도 한 줄에 하나씩은 담는다(무한 반복 방지).
pub fn wrap_text(text: &str, max_w: i32, measure: &mut dyn FnMut(&str) -> i32) -> Vec<String> {
    let mut out = Vec::new();
    for paragraph in text.split('\n') {
        let chars: Vec<char> = paragraph.chars().collect();
        let mut cur = String::new();
        let mut i = 0;
        // 줄을 한 번이라도 바꿨는지. 바꾼 뒤 줄 맨 앞의 공백은 버린다(공백이 겹쳐도 빈 줄이 생기지 않게).
        let mut broke = false;
        while i < chars.len() {
            let ch = chars[i];
            if broke && cur.is_empty() && ch == ' ' {
                i += 1;
                continue;
            }
            let mut candidate = cur.clone();
            candidate.push(ch);
            if cur.is_empty() || measure(&candidate) <= max_w {
                cur = candidate;
                i += 1;
            } else if ch == ' ' {
                // 줄 끝에서 넘치는 공백은 버린다.
                out.push(cur.trim_end().to_string());
                cur.clear();
                broke = true;
                i += 1;
            } else if let Some(pos) = cur.rfind(' ') {
                // 마지막 공백에서 줄을 바꾸고, 남은 단어를 다음 줄로 넘긴 뒤 같은 글자를 다시 본다.
                let rest = cur[pos + 1..].to_string();
                out.push(cur[..pos].trim_end().to_string());
                cur = rest;
                broke = true;
            } else {
                out.push(std::mem::take(&mut cur));
                broke = true;
            }
        }
        out.push(cur.trim_end().to_string());
    }
    out
}

/// 장의 크기. 길이는 모두 프린터 점(dot) 단위다.
pub struct PageBox {
    /// 글자를 놓을 수 있는 폭 (양쪽 여백을 뺀 값).
    pub width: i32,
    /// 한 장에 놓을 수 있는 높이 (위 · 아래 여백을 뺀 값).
    pub height: i32,
    pub dpi: i32,
}

/// 줄 목록을 여러 장으로 나눈다. 한 줄(줄바꿈으로 생긴 줄 포함)은 장을 넘나들지 않는다.
pub fn layout(
    lines: &[PrintLine],
    page: &PageBox,
    measure: &mut dyn FnMut(&str, u32, bool) -> i32,
) -> Vec<Page> {
    let mut pages: Vec<Page> = vec![Vec::new()];
    let mut y = 0;
    let place = |pages: &mut Vec<Page>, y: &mut i32, mut row: Row| {
        if *y + row.height > page.height && !pages.last().is_some_and(|p| p.is_empty()) {
            pages.push(Vec::new());
            *y = 0;
        }
        row.y = *y;
        *y += row.height;
        pages.last_mut().expect("장이 하나는 있다").push(row);
    };

    for line in lines {
        let pt = line.size.unwrap_or(DEFAULT_PT).clamp(MIN_PT, MAX_PT);
        let px = pt as i32 * page.dpi / 72;
        // 줄 간격은 글자 높이의 1.4배.
        let height = px * 14 / 10;
        let base = Row {
            text: String::new(),
            right: None,
            pt,
            bold: line.bold,
            align: line.align,
            rule: false,
            y: 0,
            height,
        };
        if line.rule {
            place(&mut pages, &mut y, Row { rule: true, ..base });
            continue;
        }
        let mut width_of = |s: &str| measure(s, pt, line.bold);
        // 오른쪽 글자가 폭의 절반을 넘으면 같은 줄에 두지 않고 따로 한 줄을 준다.
        let (texts, right_row) = match &line.right {
            Some(right) => {
                let right_w = width_of(right);
                if right_w * 2 <= page.width {
                    // 왼쪽과 오른쪽 사이에 글자 하나 정도 틈을 둔다.
                    let gap = px / 2;
                    let left_max = page.width - right_w - gap;
                    (wrap_text(&line.text, left_max, &mut width_of), None)
                } else {
                    (
                        wrap_text(&line.text, page.width, &mut width_of),
                        Some(right.clone()),
                    )
                }
            }
            None => (wrap_text(&line.text, page.width, &mut width_of), None),
        };
        let inline_right = match (&line.right, &right_row) {
            (Some(r), None) => Some(r.clone()),
            _ => None,
        };
        for (n, text) in texts.into_iter().enumerate() {
            let row = Row {
                text,
                right: if n == 0 { inline_right.clone() } else { None },
                // 오른쪽 글자가 있는 줄은 왼쪽 정렬로 둔다(정렬이 둘 다 맞을 수 없다).
                align: if inline_right.is_some() {
                    Align::Left
                } else {
                    base.align
                },
                ..base.clone()
            };
            place(&mut pages, &mut y, row);
        }
        if let Some(right) = right_row {
            place(
                &mut pages,
                &mut y,
                Row {
                    right: Some(right),
                    ..base
                },
            );
        }
    }
    pages
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 한글 · 전각은 2칸, 그 밖은 1칸으로 재는 가짜 글자 폭 (글자 크기 · 굵기는 무시).
    fn cells(s: &str) -> i32 {
        s.chars().map(|c| if c.is_ascii() { 1 } else { 2 }).sum()
    }

    fn wrap(text: &str, max: i32) -> Vec<String> {
        wrap_text(text, max, &mut cells)
    }

    fn page(width: i32, height: i32) -> PageBox {
        // dpi 72면 1pt = 1점이라 글자 높이 = 포인트, 줄 간격 = 1.4배.
        PageBox {
            width,
            height,
            dpi: 72,
        }
    }

    fn lay(lines: &[PrintLine], p: &PageBox) -> Vec<Page> {
        layout(lines, p, &mut |s, _pt, _bold| cells(s))
    }

    fn text_line(text: &str) -> PrintLine {
        PrintLine {
            text: text.into(),
            ..Default::default()
        }
    }

    #[test]
    fn 짧은_글은_그대로() {
        assert_eq!(wrap("아메리카노", 20), vec!["아메리카노"]);
    }

    #[test]
    fn 한글은_글자_단위로_자른다() {
        // 폭 8칸 = 한글 4자.
        assert_eq!(wrap("가나다라마바사", 8), vec!["가나다라", "마바사"]);
    }

    #[test]
    fn 줄마다_폭_안에_들어간다() {
        for line in wrap("아이스 아메리카노 샷 추가 시럽 빼고 얼음 많이 abc def", 10)
        {
            assert!(cells(&line) <= 10, "{line}");
        }
    }

    #[test]
    fn 공백이_있으면_단어를_자르지_않는다() {
        assert_eq!(wrap("hello world foo", 11), vec!["hello world", "foo"]);
        assert_eq!(wrap("hello world", 8), vec!["hello", "world"]);
    }

    #[test]
    fn 공백이_겹쳐도_빈_줄이_생기지_않는다() {
        assert_eq!(wrap("ab  cd", 2), vec!["ab", "cd"]);
        assert_eq!(wrap("ab   cd ef", 4), vec!["ab", "cd", "ef"]);
    }

    #[test]
    fn 아주_긴_단어는_글자_단위로_자른다() {
        assert_eq!(wrap("abcdefghij", 4), vec!["abcd", "efgh", "ij"]);
    }

    #[test]
    fn 줄바꿈_문자는_강제로_줄을_바꾼다() {
        assert_eq!(wrap("가\n나", 20), vec!["가", "나"]);
        assert_eq!(wrap("", 20), vec![""]);
    }

    #[test]
    fn 글자_하나가_폭보다_넓어도_멈추지_않는다() {
        assert_eq!(wrap("가나", 1), vec!["가", "나"]);
    }

    #[test]
    fn 오른쪽_글자는_첫_줄에만_붙고_왼쪽만_줄을_바꾼다() {
        // 폭 20. 오른쪽 "5,000" 5칸 + 틈 5(10pt 글자 높이 10의 절반) → 왼쪽 최대 10칸 = 한글 5자.
        let pages = lay(
            &[PrintLine {
                text: "가나다라마바사".into(),
                right: Some("5,000".into()),
                ..Default::default()
            }],
            &page(20, 1000),
        );
        let rows = &pages[0];
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].text, "가나다라마");
        assert_eq!(rows[0].right.as_deref(), Some("5,000"));
        assert_eq!(rows[1].text, "바사");
        assert_eq!(rows[1].right, None);
    }

    #[test]
    fn 오른쪽_글자가_너무_길면_따로_한_줄을_준다() {
        let pages = lay(
            &[PrintLine {
                text: "메뉴".into(),
                right: Some("12345678901234567".into()),
                ..Default::default()
            }],
            &page(20, 1000),
        );
        let rows = &pages[0];
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].right, None);
        assert_eq!(rows[1].text, "");
        assert_eq!(rows[1].right.as_deref(), Some("12345678901234567"));
    }

    #[test]
    fn 구분선은_글자_없이_한_줄() {
        let pages = lay(
            &[PrintLine {
                rule: true,
                ..Default::default()
            }],
            &page(20, 1000),
        );
        assert!(pages[0][0].rule);
        assert_eq!(pages[0][0].text, "");
    }

    #[test]
    fn 크기와_굵기와_정렬을_그대로_넘긴다() {
        let pages = lay(
            &[PrintLine {
                text: "#108".into(),
                size: Some(28),
                bold: true,
                align: Align::Center,
                ..Default::default()
            }],
            &page(100, 1000),
        );
        let row = &pages[0][0];
        assert_eq!((row.pt, row.bold, row.align), (28, true, Align::Center));
        // 28pt → 글자 28, 줄 간격 39.
        assert_eq!(row.height, 39);
    }

    #[test]
    fn 한_장을_넘으면_다음_장으로_이어진다() {
        // 10pt 줄 높이 14. 높이 30이면 한 장에 2줄.
        let lines: Vec<PrintLine> = (0..5).map(|n| text_line(&format!("줄{n}"))).collect();
        let pages = lay(&lines, &page(40, 30));
        assert_eq!(pages.len(), 3);
        assert_eq!(pages[0].len(), 2);
        assert_eq!(pages[2].len(), 1);
        // 새 장은 위에서 다시 시작한다.
        assert_eq!(pages[1][0].y, 0);
        assert_eq!(pages[1][1].y, 14);
    }

    #[test]
    fn 장보다_큰_한_줄도_빈_장에_그린다() {
        let pages = lay(
            &[PrintLine {
                text: "큰글".into(),
                size: Some(72),
                ..Default::default()
            }],
            &page(400, 10),
        );
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].len(), 1);
    }

    #[test]
    fn 줄이_없으면_빈_장_하나() {
        assert_eq!(lay(&[], &page(40, 30)).len(), 1);
    }

    #[test]
    fn 글자_크기는_범위_안으로_맞춘다() {
        let pages = lay(
            &[PrintLine {
                text: "a".into(),
                size: Some(1000),
                ..Default::default()
            }],
            &page(40, 100_000),
        );
        assert_eq!(pages[0][0].pt, 72);
    }

    #[test]
    fn 화면이_보낸_json을_읽는다() {
        let line: PrintLine = serde_json::from_str(
            r#"{"text":"가","size":14,"bold":true,"align":"right","right":"1,000"}"#,
        )
        .unwrap();
        assert_eq!(line.align, Align::Right);
        assert!(line.bold && !line.rule);
        let rule: PrintLine = serde_json::from_str(r#"{"rule":true}"#).unwrap();
        assert!(rule.rule && rule.text.is_empty());
    }
}
