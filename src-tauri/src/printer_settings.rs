//! 프린터 칸 설정을 이 PC의 앱 설정 폴더에 파일로 저장한다 (스펙 2.5, 3.1).
//! 모양은 화면의 `src/shared/printer/printer-settings.ts`와 같게 둔다.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

const FILE_NAME: &str = "printer-settings.json";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrinterSlot {
    pub printer_name: String,
    pub purpose: String,
    pub print_order: bool,
    pub print_receipt: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrinterSettings {
    pub version: u32,
    pub slots: [Option<PrinterSlot>; 3],
}

impl Default for PrinterSettings {
    fn default() -> Self {
        Self {
            version: 1,
            slots: [None, None, None],
        }
    }
}

/// 버전 1이고, 같은 프린터가 두 칸에 없어야 한다. 중복이면 T12가 주문서를 두 번 낸다 (스펙 2.2-2).
/// 화면도 막지만, 손으로 고친 파일이나 화면 버그까지 여기서 한 번 더 막는다.
fn validate(settings: &PrinterSettings) -> Result<(), String> {
    if settings.version != 1 {
        return Err(format!("모르는 버전 {}", settings.version));
    }
    let names: Vec<&str> = settings
        .slots
        .iter()
        .flatten()
        .map(|slot| slot.printer_name.as_str())
        .collect();
    if (1..names.len()).any(|i| names[..i].contains(&names[i])) {
        return Err("같은 프린터가 두 칸에 있습니다.".into());
    }
    Ok(())
}

fn parse(text: &str) -> Result<PrinterSettings, String> {
    let settings: PrinterSettings = serde_json::from_str(text).map_err(|e| e.to_string())?;
    validate(&settings)?;
    Ok(settings)
}

/// 파일이 없거나 모양이 다르면 빈 설정 (스펙 3.1).
/// 그 밖의 읽기 오류(예: 백신이 파일을 잡고 있음)는 오류로 올린다. 빈 설정으로 시작하면
/// 다음 저장이 멀쩡한 설정을 빈 값으로 덮어쓰기 때문이다 (스펙 2.5).
fn load_from(path: &Path) -> Result<PrinterSettings, String> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PrinterSettings::default());
        }
        Err(e) => return Err(format!("설정 파일 읽기 실패: {e}")),
    };
    Ok(parse(&text).unwrap_or_else(|e| {
        eprintln!("[printer-settings] 파일 모양이 달라 빈 설정으로 시작: {e}");
        // 다음 저장이 원래 파일을 덮어쓰므로, 원인을 볼 수 있게 사본을 남긴다.
        if let Err(e) = fs::copy(path, path.with_extension("json.broken")) {
            eprintln!("[printer-settings] 깨진 파일 사본을 남기지 못함: {e}");
        }
        PrinterSettings::default()
    }))
}

/// 임시 파일에 쓴 뒤 이름을 바꾼다. 쓰다가 꺼져도 이전 설정 파일이 반쯤 쓰인 채로 남지 않게 한다.
/// 오류에는 단계를 붙인다. Windows는 백신 · 탐색기가 파일을 잡아 rename만 실패하는 일이 있다.
fn save_to(path: &Path, settings: &PrinterSettings) -> Result<(), String> {
    validate(settings)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("설정 폴더 만들기 실패: {e}"))?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    let mut file = fs::File::create(&tmp).map_err(|e| format!("임시 파일 만들기 실패: {e}"))?;
    file.write_all(text.as_bytes())
        .map_err(|e| format!("임시 파일 쓰기 실패: {e}"))?;
    // 디스크에 다 쓴 뒤 이름을 바꾼다. 안 그러면 정전 때 빈 파일로 바뀐 이름만 남을 수 있다.
    file.sync_all()
        .map_err(|e| format!("임시 파일 디스크 기록 실패: {e}"))?;
    drop(file);
    fs::rename(&tmp, path).map_err(|e| format!("설정 파일 바꾸기 실패: {e}"))
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(FILE_NAME))
}

#[tauri::command]
pub fn load_printer_settings(app: tauri::AppHandle) -> Result<PrinterSettings, String> {
    load_from(&settings_path(&app)?)
}

// 동기 명령으로 둔다: 메인 스레드에서 도착 순서대로 처리되어, 빠르게 연달아 바꿔도 마지막 값이 남는다.
// 화면(PrinterSettingsScreen의 저장 실패 되돌리기)이 이 순서에 기댄다. async로 바꾸지 말 것.
// 대가: 파일 쓰기(sync_all 포함) 동안 메인 스레드가 잠깐 멈춘다.
#[tauri::command]
pub fn save_printer_settings(
    app: tauri::AppHandle,
    settings: PrinterSettings,
) -> Result<(), String> {
    save_to(&settings_path(&app)?, &settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "whale-printer-settings-{}-{name}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        dir.join(FILE_NAME)
    }

    fn sample() -> PrinterSettings {
        PrinterSettings {
            version: 1,
            slots: [
                None,
                Some(PrinterSlot {
                    printer_name: "Microsoft Print to PDF".into(),
                    purpose: "카운터 영수증".into(),
                    print_order: true,
                    print_receipt: false,
                }),
                None,
            ],
        }
    }

    #[test]
    fn 파일이_없으면_빈_설정() {
        assert_eq!(
            load_from(&temp_path("none")),
            Ok(PrinterSettings::default())
        );
    }

    #[test]
    fn 저장한_설정을_다시_읽는다() {
        let path = temp_path("roundtrip");
        save_to(&path, &sample()).unwrap();
        assert_eq!(load_from(&path), Ok(sample()));
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn 화면과_같은_camel_case_모양으로_쓴다() {
        let path = temp_path("shape");
        save_to(&path, &sample()).unwrap();
        let text = fs::read_to_string(&path).unwrap();
        assert!(text.contains("\"printerName\""));
        assert!(text.contains("\"printReceipt\""));
    }

    #[test]
    fn 깨진_파일이면_빈_설정이고_파일은_남긴다() {
        let path = temp_path("broken");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        for broken in [
            "{ not json",
            r#"{"version":2,"slots":[null,null,null]}"#,
            r#"{"version":1,"slots":[null,null]}"#,
            r#"{"version":1,"slots":[{"printerName":"A","purpose":"","printOrder":true,"printReceipt":false},{"printerName":"A","purpose":"","printOrder":false,"printReceipt":true},null]}"#,
        ] {
            fs::write(&path, broken).unwrap();
            assert_eq!(load_from(&path), Ok(PrinterSettings::default()));
            assert_eq!(fs::read_to_string(&path).unwrap(), broken);
            assert_eq!(
                fs::read_to_string(path.with_extension("json.broken")).unwrap(),
                broken
            );
        }
    }

    #[test]
    fn 모르는_버전은_저장하지_않는다() {
        let mut settings = sample();
        settings.version = 2;
        assert!(save_to(&temp_path("version"), &settings).is_err());
    }

    #[test]
    fn 화면이_보내는_json을_그대로_읽는다() {
        // src/shared/printer/printer-settings.ts 모양 그대로 (JSON.stringify 결과).
        let text = r#"{"version":1,"slots":[null,{"printerName":"Microsoft Print to PDF","purpose":"카운터 영수증","printOrder":true,"printReceipt":false},null]}"#;
        assert_eq!(parse(text), Ok(sample()));
    }

    #[test]
    fn 읽기_오류는_빈_설정이_아니라_오류() {
        // 파일 자리에 폴더가 있으면 "파일 없음"이 아닌 읽기 오류가 난다.
        let path = temp_path("unreadable");
        fs::create_dir_all(&path).unwrap();
        assert!(load_from(&path).is_err());
    }

    #[test]
    fn 같은_프린터가_두_칸이면_저장하지_않는다() {
        let mut settings = sample();
        settings.slots[0] = settings.slots[1].clone();
        assert!(save_to(&temp_path("dup"), &settings).is_err());
    }
}
