//! 프린터 목록과 줄 목록 출력 (T11 스펙 2.2 · 2.3 · 3.3, T12 스펙 2장).
//! Windows는 인쇄 스풀러의 프린터 목록(EnumPrintersW)과 Windows 일반 인쇄(GDI)를 쓴다.
//! 그 밖의 OS(Linux · Mac 개발 PC)는 목록이 빈 배열이고 출력은 "출력할 수 없음" 오류다.
//! 줄바꿈 · 장 나누기 계산은 print_layout.rs (OS와 상관없이 테스트).

use crate::print_layout::PrintLine;

// 화면이 이유를 그대로 보이므로 입력값(프린터 이름 · 내용)이 들어가지 않는 고정 문구만 쓴다 (스펙 5장).
#[cfg(windows)]
const REASON_NO_PRINTER: &str = "프린터를 찾을 수 없음";
#[cfg(windows)]
const REASON_START: &str = "인쇄를 시작하지 못함";
#[cfg(windows)]
const REASON_FINISH: &str = "인쇄를 마치지 못함";
#[cfg(windows)]
const REASON_FONT: &str = "글꼴을 만들지 못함";
#[cfg(not(windows))]
const REASON_UNSUPPORTED: &str = "이 PC에서는 출력할 수 없음";
const REASON_BAD_REQUEST: &str = "출력 요청이 올바르지 않음";

// 두 명령 모두 async: Tauri가 메인 스레드 밖에서 돌린다. 스풀러 · 드라이버가 늦게 답해도 화면이 멈추지 않게 한다.
#[tauri::command]
pub async fn list_printers() -> Result<Vec<String>, String> {
    imp::list_printers()
}

/// 줄 목록을 그려 인쇄 대기열에 넣는다. 시험 인쇄 · 주문서 · 영수증이 모두 이 명령을 쓴다.
/// paper_width_mm는 슬롯의 용지 폭(58 / 80)이다. 종이가 실제로 나왔는지는 알 수 없다 (Q47).
#[tauri::command]
pub async fn print_document(
    printer_name: String,
    doc_name: String,
    paper_width_mm: u32,
    lines: Vec<PrintLine>,
) -> Result<(), String> {
    if printer_name.is_empty() || !matches!(paper_width_mm, 58 | 80) {
        return Err(REASON_BAD_REQUEST.into());
    }
    imp::print_lines(&printer_name, &doc_name, paper_width_mm, &lines)
}

#[cfg(not(windows))]
mod imp {
    use crate::print_layout::PrintLine;

    pub fn list_printers() -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }

    pub fn print_lines(
        _printer_name: &str,
        _doc_name: &str,
        _paper_width_mm: u32,
        _lines: &[PrintLine],
    ) -> Result<(), String> {
        Err(super::REASON_UNSUPPORTED.into())
    }
}

#[cfg(windows)]
mod imp {
    use super::{REASON_FINISH, REASON_FONT, REASON_NO_PRINTER, REASON_START};
    use crate::print_layout::{Align, PageBox, PrintLine, Row, layout};
    use std::collections::HashMap;
    use std::io::Error;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Graphics::Gdi::{
        BLACKNESS, CLIP_DEFAULT_PRECIS, CreateDCW, CreateFontW, DEFAULT_PITCH, DEFAULT_QUALITY,
        DeleteDC, DeleteObject, FF_DONTCARE, FW_BOLD, FW_NORMAL, GetCharWidth32W, GetDeviceCaps,
        HANGUL_CHARSET, HDC, HFONT, HORZRES, LOGPIXELSX, LOGPIXELSY, OUT_DEFAULT_PRECIS, PatBlt,
        SelectObject, TextOutW, VERTRES,
    };
    use windows_sys::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    };
    use windows_sys::Win32::Storage::Xps::{
        AbortDoc, DOCINFOW, EndDoc, EndPage, StartDocW, StartPage,
    };

    /// 맑은 고딕. 한글 이름보다 영어 글꼴 이름이 Windows 표시 언어와 상관없이 확실히 찾아진다.
    const FONT_FACE: &str = "Malgun Gothic";
    /// Win32 오류 코드 ERROR_INSUFFICIENT_BUFFER. Win32_Foundation 기능을 더 켜지 않으려고 값만 둔다.
    const ERROR_INSUFFICIENT_BUFFER: i32 = 122;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn last_error(what: &str) -> String {
        let error = Error::last_os_error();
        // GDI 함수 일부는 실패해도 오류 코드를 남기지 않는다. 0("성공")을 그대로 적으면 로그가 헷갈린다.
        if error.raw_os_error() == Some(0) {
            format!("{what} 실패 (Windows가 이유를 알려주지 않음)")
        } else {
            format!("{what} 실패: {error}")
        }
    }

    /// PWSTR(0으로 끝나는 UTF-16)을 String으로.
    unsafe fn from_wide(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut len = 0;
        while unsafe { *p.add(len) } != 0 {
            len += 1;
        }
        String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(p, len) })
    }

    /// 이 PC에 설치된 프린터와 연결된 네트워크 프린터 이름. 레벨 4는 이름 · 서버 · 속성만 담아 빠르다.
    pub fn list_printers() -> Result<Vec<String>, String> {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let (mut needed, mut count) = (0u32, 0u32);
        // PRINTER_INFO_4W 정렬을 맞추려고 u64 버퍼를 쓴다. 처음에는 빈 버퍼로 불러 필요한 크기를 받는다.
        let mut buf: Vec<u64> = Vec::new();
        // 두 호출 사이에 프린터가 추가되면 다시 "버퍼 부족"이 올 수 있어 몇 번 더 시도한다.
        for _ in 0..3 {
            let ok = unsafe {
                EnumPrintersW(
                    flags,
                    null(),
                    4,
                    if buf.is_empty() {
                        null_mut()
                    } else {
                        buf.as_mut_ptr().cast()
                    },
                    (buf.len() * 8) as u32,
                    &mut needed,
                    &mut count,
                )
            };
            if ok != 0 {
                if count == 0 {
                    return Ok(Vec::new());
                }
                let infos = unsafe {
                    std::slice::from_raw_parts(
                        buf.as_ptr().cast::<PRINTER_INFO_4W>(),
                        count as usize,
                    )
                };
                return Ok(infos
                    .iter()
                    .map(|info| unsafe { from_wide(info.pPrinterName) })
                    .filter(|name| !name.is_empty())
                    .collect());
            }
            // 버퍼 부족이 아니면 진짜 오류다 (예: 인쇄 스풀러 멈춤). 빈 목록으로 돌려주면 화면이
            // "설치된 프린터가 없습니다."와 모든 칸 "(찾을 수 없음)"을 잘못 보이므로 오류로 올린다.
            if Error::last_os_error().raw_os_error() != Some(ERROR_INSUFFICIENT_BUFFER) {
                return Err(last_error("프린터 목록 읽기"));
            }
            buf = vec![0u64; (needed as usize).div_ceil(8)];
        }
        Err("프린터 목록 읽기 실패: 목록이 계속 바뀝니다.".into())
    }

    /// 실패 이유는 고정 문구로 돌려주고, 어느 단계였는지와 Windows 오류 번호는 로그에만 남긴다 (입력값 없음).
    /// 해상도 · 인쇄 영역 검사처럼 Windows 함수 실패가 아닌 곳에서는 오류 번호가 예전 값일 수 있어 참고만 한다.
    fn fail(step: &str, reason: &'static str) -> String {
        log::warn!(
            "출력 실패: {step}, 오류 코드 {:?}",
            Error::last_os_error().raw_os_error()
        );
        reason.into()
    }

    /// 프린터 DC와 만든 글꼴 · 잰 글자 폭. 인쇄 중 어느 단계에서 실패해도 문서를 취소하고 DC · 글꼴을 지운다.
    struct Gdi {
        hdc: HDC,
        started: bool,
        /// 세로 해상도(점/인치). 포인트를 글자 높이(점)로 바꾸는 데 쓴다.
        dpi: i32,
        fonts: HashMap<(u32, bool), HFONT>,
        widths: HashMap<(u32, bool, char), i32>,
    }

    impl Drop for Gdi {
        fn drop(&mut self) {
            unsafe {
                if self.started {
                    AbortDoc(self.hdc);
                }
                DeleteDC(self.hdc);
                for font in self.fonts.values() {
                    DeleteObject(*font);
                }
            }
        }
    }

    impl Gdi {
        /// 글자 크기(포인트) · 굵기의 글꼴을 DC에 고른다. 만들지 못하면 false.
        fn select(&mut self, pt: u32, bold: bool) -> bool {
            let font = match self.fonts.get(&(pt, bold)) {
                Some(font) => *font,
                None => {
                    let face = wide(FONT_FACE);
                    // 음수 높이는 "글자 높이" 기준이라는 GDI 약속이다.
                    let height = pt as i32 * self.dpi / 72;
                    let font = unsafe {
                        CreateFontW(
                            -height,
                            0,
                            0,
                            0,
                            if bold { FW_BOLD } else { FW_NORMAL } as i32,
                            0,
                            0,
                            0,
                            HANGUL_CHARSET as u32,
                            OUT_DEFAULT_PRECIS as u32,
                            CLIP_DEFAULT_PRECIS as u32,
                            DEFAULT_QUALITY as u32,
                            (DEFAULT_PITCH | FF_DONTCARE) as u32,
                            face.as_ptr(),
                        )
                    };
                    if font.is_null() {
                        return false;
                    }
                    self.fonts.insert((pt, bold), font);
                    font
                }
            };
            unsafe { SelectObject(self.hdc, font) };
            true
        }

        /// 글자 하나의 폭. 글꼴이 골라진 상태에서만 부른다. 못 재면 글자 높이만큼으로 본다.
        fn char_width(&mut self, pt: u32, bold: bool, ch: char) -> i32 {
            if let Some(width) = self.widths.get(&(pt, bold, ch)) {
                return *width;
            }
            let code = ch as u32;
            let mut width = 0i32;
            let ok =
                code <= 0xFFFF && unsafe { GetCharWidth32W(self.hdc, code, code, &mut width) } != 0;
            if !ok {
                width = pt as i32 * self.dpi / 72;
            }
            self.widths.insert((pt, bold, ch), width);
            width
        }

        fn text_width(&mut self, text: &str, pt: u32, bold: bool) -> i32 {
            if !self.select(pt, bold) {
                return text.chars().count() as i32 * (pt as i32 * self.dpi / 72);
            }
            text.chars().map(|ch| self.char_width(pt, bold, ch)).sum()
        }

        fn draw(&mut self, x: i32, y: i32, text: &str) -> Result<(), String> {
            let utf16: Vec<u16> = text.encode_utf16().collect();
            if unsafe { TextOutW(self.hdc, x, y, utf16.as_ptr(), utf16.len() as i32) } == 0 {
                return Err(fail("글자 그리기", REASON_FINISH));
            }
            Ok(())
        }

        fn draw_row(&mut self, row: &Row, margin: (i32, i32), width: i32) -> Result<(), String> {
            let y = margin.1 + row.y;
            if row.rule {
                let thickness = (self.dpi / 100).max(2);
                let ok = unsafe {
                    PatBlt(
                        self.hdc,
                        margin.0,
                        y + row.height / 2,
                        width,
                        thickness,
                        BLACKNESS,
                    )
                };
                return if ok == 0 {
                    Err(fail("구분선 그리기", REASON_FINISH))
                } else {
                    Ok(())
                };
            }
            if !self.select(row.pt, row.bold) {
                return Err(fail("글꼴 만들기", REASON_FONT));
            }
            // 줄 간격 안에서 글자를 세로 가운데에 둔다.
            let text_height = row.pt as i32 * self.dpi / 72;
            let y = y + (row.height - text_height) / 2;
            if !row.text.is_empty() {
                let w = self.text_width(&row.text, row.pt, row.bold);
                let x = match row.align {
                    Align::Left => margin.0,
                    Align::Center => margin.0 + (width - w) / 2,
                    Align::Right => margin.0 + width - w,
                }
                .max(margin.0);
                self.draw(x, y, &row.text)?;
            }
            if let Some(right) = &row.right {
                let w = self.text_width(right, row.pt, row.bold);
                self.draw((margin.0 + width - w).max(margin.0), y, right)?;
            }
            Ok(())
        }
    }

    pub fn print_lines(
        printer_name: &str,
        doc_name: &str,
        paper_width_mm: u32,
        lines: &[PrintLine],
    ) -> Result<(), String> {
        let device = wide(printer_name);
        // 프린터가 없거나 드라이버가 깨졌으면 여기서 null이 온다.
        let hdc = unsafe { CreateDCW(null(), device.as_ptr(), null(), null()) };
        if hdc.is_null() {
            return Err(fail("프린터 열기", REASON_NO_PRINTER));
        }
        let mut gdi = Gdi {
            hdc,
            started: false,
            dpi: 0,
            fonts: HashMap::new(),
            widths: HashMap::new(),
        };

        let dpi_x = unsafe { GetDeviceCaps(hdc, LOGPIXELSX as i32) };
        let dpi_y = unsafe { GetDeviceCaps(hdc, LOGPIXELSY as i32) };
        if dpi_x <= 0 || dpi_y <= 0 {
            return Err(fail("해상도 읽기", REASON_START));
        }
        gdi.dpi = dpi_y;
        // 여백 약 2.5mm. 글자를 놓는 폭은 슬롯의 용지 폭과 드라이버가 알려 준 인쇄 가능 폭 중 작은 쪽이다:
        // 슬롯 설정이 실제 용지보다 넓어도 오른쪽이 잘리지 않게 한다.
        let margin = (dpi_x / 10, dpi_y / 10);
        let horz = unsafe { GetDeviceCaps(hdc, HORZRES as i32) };
        let vert = unsafe { GetDeviceCaps(hdc, VERTRES as i32) };
        let paper_px = (paper_width_mm as i64 * dpi_x as i64 * 10 / 254) as i32;
        let width = horz.min(paper_px) - 2 * margin.0;
        let height = vert - 2 * margin.1;
        if width < dpi_x / 2 || height < dpi_y / 2 {
            return Err(fail("인쇄 영역 읽기", REASON_START));
        }

        let page = PageBox {
            width,
            height,
            dpi: dpi_y,
        };
        let pages = layout(lines, &page, &mut |text, pt, bold| {
            gdi.text_width(text, pt, bold)
        });

        let doc_name = wide(doc_name);
        let doc = DOCINFOW {
            cbSize: size_of::<DOCINFOW>() as i32,
            lpszDocName: doc_name.as_ptr(),
            lpszOutput: null(),
            lpszDatatype: null(),
            fwType: 0,
        };
        if unsafe { StartDocW(hdc, &doc) } <= 0 {
            return Err(fail("인쇄 문서 시작", REASON_START));
        }
        gdi.started = true;
        for rows in &pages {
            if unsafe { StartPage(hdc) } <= 0 {
                return Err(fail("페이지 시작", REASON_START));
            }
            for row in rows {
                gdi.draw_row(row, margin, width)?;
            }
            if unsafe { EndPage(hdc) } <= 0 {
                return Err(fail("페이지 끝내기", REASON_FINISH));
            }
        }
        if unsafe { EndDoc(hdc) } <= 0 {
            return Err(fail("인쇄 문서 끝내기", REASON_FINISH));
        }
        // 대기열에 넣었으니 취소하지 않는다.
        gdi.started = false;
        Ok(())
    }
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    fn print(name: &str, mm: u32) -> Result<(), String> {
        tauri::async_runtime::block_on(print_document(
            name.into(),
            "시험".into(),
            mm,
            vec![PrintLine {
                text: "가나다".into(),
                ..Default::default()
            }],
        ))
    }

    #[test]
    fn 윈도우가_아니면_목록은_빈_배열() {
        assert_eq!(
            tauri::async_runtime::block_on(list_printers()),
            Ok(Vec::new())
        );
    }

    #[test]
    fn 윈도우가_아니면_출력은_오류() {
        assert_eq!(
            print("Microsoft Print to PDF", 80).unwrap_err(),
            "이 PC에서는 출력할 수 없음"
        );
    }

    #[test]
    fn 프린터_이름이_비면_오류() {
        assert_eq!(print("", 80).unwrap_err(), "출력 요청이 올바르지 않음");
    }

    #[test]
    fn 용지_폭이_58_80이_아니면_오류() {
        assert_eq!(print("A", 70).unwrap_err(), "출력 요청이 올바르지 않음");
    }
}
