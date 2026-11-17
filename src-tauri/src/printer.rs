//! 프린터 목록과 시험 인쇄 (스펙 2.2, 2.3, 3.3).
//! Windows는 인쇄 스풀러의 프린터 목록(EnumPrintersW)과 Windows 일반 인쇄(GDI)를 쓴다.
//! 그 밖의 OS(Linux · Mac 개발 PC)는 목록이 빈 배열이고 시험 인쇄는 "지원하지 않음" 오류다.

// 두 명령 모두 async: Tauri가 메인 스레드 밖에서 돌린다. 스풀러 · 드라이버가 늦게 답해도 화면이 멈추지 않게 한다.
#[tauri::command]
pub async fn list_printers() -> Result<Vec<String>, String> {
    imp::list_printers()
}

#[tauri::command]
pub async fn print_test_page(printer_name: String, lines: Vec<String>) -> Result<(), String> {
    if printer_name.is_empty() {
        return Err("프린터 이름이 비었습니다.".into());
    }
    imp::print_lines(&printer_name, &lines)
}

#[cfg(not(windows))]
mod imp {
    pub fn list_printers() -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }

    pub fn print_lines(_printer_name: &str, _lines: &[String]) -> Result<(), String> {
        Err("이 OS에서는 시험 인쇄를 지원하지 않습니다 (Windows 전용).".into())
    }
}

#[cfg(windows)]
mod imp {
    use std::io::Error;
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Graphics::Gdi::{
        CLIP_DEFAULT_PRECIS, CreateDCW, CreateFontW, DEFAULT_PITCH, DEFAULT_QUALITY, DeleteDC,
        DeleteObject, FF_DONTCARE, FW_NORMAL, GetDeviceCaps, HANGUL_CHARSET, HDC, LOGPIXELSY,
        OUT_DEFAULT_PRECIS, SelectObject, TextOutW,
    };
    use windows_sys::Win32::Graphics::Printing::{
        EnumPrintersW, PRINTER_ENUM_CONNECTIONS, PRINTER_ENUM_LOCAL, PRINTER_INFO_4W,
    };
    use windows_sys::Win32::Storage::Xps::{
        AbortDoc, DOCINFOW, EndDoc, EndPage, StartDocW, StartPage,
    };

    /// 시험 페이지 글자 크기(포인트). 80mm 영수증 용지에도 한 줄이 대부분 들어가게 작게 둔다.
    /// TextOutW는 줄을 바꾸지 않으므로, 넘치는 글자(긴 프린터 · 점포 이름)는 잘린다.
    const FONT_POINTS: i32 = 10;
    /// 맑은 고딕. 한글 이름보다 영어 글꼴 이름이 Windows 표시 언어와 상관없이 확실히 찾아진다.
    const FONT_FACE: &str = "Malgun Gothic";
    /// Win32 오류 코드 ERROR_INSUFFICIENT_BUFFER. Win32_Foundation 기능을 더 켜지 않으려고 값만 둔다.
    const ERROR_INSUFFICIENT_BUFFER: i32 = 122;
    const DOC_NAME: &str = "픽업오더 주문접수 시험 인쇄";

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

    /// 인쇄 중 어느 단계에서 실패해도 문서를 취소하고 DC를 지우려고 둔다.
    struct PrintJob {
        hdc: HDC,
        started: bool,
    }

    impl Drop for PrintJob {
        fn drop(&mut self) {
            unsafe {
                if self.started {
                    AbortDoc(self.hdc);
                }
                DeleteDC(self.hdc);
            }
        }
    }

    pub fn print_lines(printer_name: &str, lines: &[String]) -> Result<(), String> {
        let device = wide(printer_name);
        // 프린터가 없거나 드라이버가 깨졌으면 여기서 null이 온다.
        let hdc = unsafe { CreateDCW(null(), device.as_ptr(), null(), null()) };
        if hdc.is_null() {
            return Err(last_error("프린터 열기"));
        }
        let mut job = PrintJob {
            hdc,
            started: false,
        };

        let doc_name = wide(DOC_NAME);
        let doc = DOCINFOW {
            cbSize: size_of::<DOCINFOW>() as i32,
            lpszDocName: doc_name.as_ptr(),
            lpszOutput: null(),
            lpszDatatype: null(),
            fwType: 0,
        };
        if unsafe { StartDocW(hdc, &doc) } <= 0 {
            return Err(last_error("인쇄 문서 시작"));
        }
        job.started = true;
        if unsafe { StartPage(hdc) } <= 0 {
            return Err(last_error("페이지 시작"));
        }

        // 포인트를 프린터 해상도(점)로 바꾼다. 음수 높이는 "글자 높이" 기준이라는 GDI 약속이다.
        let dpi = unsafe { GetDeviceCaps(hdc, LOGPIXELSY as i32) };
        let height = FONT_POINTS * dpi / 72;
        let face = wide(FONT_FACE);
        let font = unsafe {
            CreateFontW(
                -height,
                0,
                0,
                0,
                FW_NORMAL as i32,
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
            return Err(last_error("글꼴 만들기"));
        }
        let previous = unsafe { SelectObject(hdc, font) };

        let margin = dpi / 10; // 약 2.5mm
        let line_gap = height * 3 / 2;
        let mut result = Ok(());
        for (i, line) in lines.iter().enumerate() {
            let text: Vec<u16> = line.encode_utf16().collect();
            let y = margin + line_gap * i as i32;
            if unsafe { TextOutW(hdc, margin, y, text.as_ptr(), text.len() as i32) } == 0 {
                result = Err(last_error("글자 그리기"));
                break;
            }
        }
        unsafe {
            SelectObject(hdc, previous);
            DeleteObject(font);
        }
        result?;

        if unsafe { EndPage(hdc) } <= 0 {
            return Err(last_error("페이지 끝내기"));
        }
        if unsafe { EndDoc(hdc) } <= 0 {
            return Err(last_error("인쇄 문서 끝내기"));
        }
        // 대기열에 넣었으니 취소하지 않는다.
        job.started = false;
        Ok(())
    }
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn 윈도우가_아니면_목록은_빈_배열() {
        assert_eq!(
            tauri::async_runtime::block_on(list_printers()),
            Ok(Vec::new())
        );
    }

    #[test]
    fn 윈도우가_아니면_시험_인쇄는_오류() {
        let result = tauri::async_runtime::block_on(print_test_page(
            "Microsoft Print to PDF".into(),
            vec!["가나다".into()],
        ));
        assert!(result.unwrap_err().contains("지원하지 않습니다"));
    }

    #[test]
    fn 프린터_이름이_비면_오류() {
        assert!(tauri::async_runtime::block_on(print_test_page(String::new(), vec![])).is_err());
    }
}
