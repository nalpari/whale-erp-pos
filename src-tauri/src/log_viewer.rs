//! "로그 확인" 화면용 명령 (스펙 3.3). 로그 폴더는 앱이 정한 곳만 읽고 열며, 화면에서 경로를 받지 않는다.

use serde::Serialize;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;
use tauri::Manager;

/// 현재 로그 파일 이름. `lib.rs`의 로그 플러그인 설정(`file_name`)과 같아야 한다.
pub const LOG_FILE_STEM: &str = "app";
/// 화면이 아무리 큰 값을 보내도 이 줄 수까지만 읽는다.
const MAX_LINES: u32 = 1000;
const CHUNK: u64 = 8 * 1024;

#[derive(Debug, Serialize)]
pub struct RecentLogs {
    pub path: String,
    pub lines: Vec<String>,
}

/// 파일의 마지막 `n`줄. 끝에서부터 덩어리로 읽어서 큰 파일(최대 5MB)도 전체를 올리지 않는다.
/// 파일이 없으면 빈 목록이다.
fn tail_lines(path: &Path, n: usize) -> std::io::Result<Vec<String>> {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut pos = file.metadata()?.len();
    // 덩어리를 뒤에서 앞으로 모은 뒤 한 번에 이어 붙인다 (덩어리 경계에서 한글이 잘려도 안전하고,
    // 줄바꿈이 거의 없는 긴 줄에서도 매번 전체를 다시 복사하지 않는다).
    let mut chunks: Vec<Vec<u8>> = Vec::new();
    let mut newlines = 0usize;
    // 줄바꿈을 n+1개 셀 때까지 읽는다. 첫 줄이 잘렸을 수 있어 하나 더 읽는다.
    while pos > 0 && newlines <= n {
        let step = CHUNK.min(pos);
        pos -= step;
        file.seek(SeekFrom::Start(pos))?;
        let mut chunk = vec![0u8; step as usize];
        file.read_exact(&mut chunk)?;
        newlines += chunk.iter().filter(|&&b| b == b'\n').count();
        chunks.push(chunk);
    }
    chunks.reverse();
    let buf: Vec<u8> = chunks.concat();
    let text = String::from_utf8_lossy(&buf);
    let mut lines: Vec<&str> = text.lines().collect();
    // 파일 중간부터 읽었다면 맨 앞 줄은 잘렸을 수 있어 버린다.
    if pos > 0 && !lines.is_empty() {
        lines.remove(0);
    }
    let start = lines.len().saturating_sub(n);
    Ok(lines[start..].iter().map(|s| s.to_string()).collect())
}

#[tauri::command]
pub fn read_recent_logs(app: tauri::AppHandle, lines: u32) -> Result<RecentLogs, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    let file = dir.join(format!("{LOG_FILE_STEM}.log"));
    let lines = tail_lines(&file, lines.min(MAX_LINES) as usize)
        .map_err(|e| format!("로그 파일 읽기 실패({}): {e}", file.display()))?;
    Ok(RecentLogs {
        path: dir.to_string_lossy().into_owned(),
        lines,
    })
}

/// 운영체제 파일 관리자로 로그 폴더를 연다. 새 라이브러리 없이 운영체제 명령을 부른다.
#[tauri::command]
pub fn open_log_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    // 아직 한 줄도 안 남겨 폴더가 없을 수 있다.
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("로그 폴더 만들기 실패({}): {e}", dir.display()))?;
    #[cfg(target_os = "windows")]
    let program = "explorer.exe";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let program = "xdg-open";
    // explorer.exe는 성공해도 종료 코드 1을 돌려주므로 실행만 확인하고 기다리지 않는다.
    let mut child = std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map_err(|e| format!("{program} 실행 실패: {e}"))?;
    // 끝난 프로세스가 좀비로 남지 않게 회수한다. 기다리는 동안 명령은 먼저 돌려준다.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str, content: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("log-viewer-{}-{name}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("app.log");
        std::fs::File::create(&path)
            .unwrap()
            .write_all(content)
            .unwrap();
        path
    }

    #[test]
    fn missing_file_is_empty() {
        let path = std::env::temp_dir().join("log-viewer-없는-파일.log");
        assert!(tail_lines(&path, 5).unwrap().is_empty());
    }

    #[test]
    fn empty_file_is_empty() {
        let path = temp_file("empty", b"");
        assert!(tail_lines(&path, 5).unwrap().is_empty());
    }

    #[test]
    fn shorter_than_n_returns_all() {
        let path = temp_file("short", "가\n나\n다\n".as_bytes());
        assert_eq!(tail_lines(&path, 200).unwrap(), vec!["가", "나", "다"]);
    }

    #[test]
    fn last_line_without_newline_is_kept() {
        let path = temp_file("nonl", b"a\nb");
        assert_eq!(tail_lines(&path, 5).unwrap(), vec!["a", "b"]);
    }

    #[test]
    fn big_file_returns_exactly_last_n_lines() {
        // 덩어리(8KB)를 여러 번 넘고 한글이 덩어리 경계에 걸리도록 크게 만든다.
        let content: String = (0..5000).map(|i| format!("줄 번호 {i} 가나다\n")).collect();
        let path = temp_file("big", content.as_bytes());
        let got = tail_lines(&path, 200).unwrap();
        assert_eq!(got.len(), 200);
        assert_eq!(got.first().unwrap(), "줄 번호 4800 가나다");
        assert_eq!(got.last().unwrap(), "줄 번호 4999 가나다");
    }

    #[test]
    fn big_file_without_trailing_newline_keeps_last_line() {
        let mut content: String = (0..3000).map(|i| format!("줄 {i}\n")).collect();
        content.push_str("마지막");
        let path = temp_file("bignonl", content.as_bytes());
        let got = tail_lines(&path, 3).unwrap();
        assert_eq!(got, vec!["줄 2998", "줄 2999", "마지막"]);
    }

    #[test]
    fn zero_lines_is_empty() {
        let path = temp_file("zero", b"a\nb\n");
        assert!(tail_lines(&path, 0).unwrap().is_empty());
    }

    #[test]
    fn very_long_single_line_is_returned() {
        let content = format!("{}\n", "가".repeat(200_000));
        let path = temp_file("long", content.as_bytes());
        let got = tail_lines(&path, 5).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].chars().count(), 200_000);
    }

    #[test]
    fn n_equal_to_total_lines_includes_first_line() {
        let content: String = (0..2000).map(|i| format!("줄 {i}\n")).collect();
        let path = temp_file("exact", content.as_bytes());
        let got = tail_lines(&path, 2000).unwrap();
        assert_eq!(got.len(), 2000);
        assert_eq!(got[0], "줄 0");
    }
}
