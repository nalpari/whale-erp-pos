//! 로그인 화면용 시스템 명령 (스펙 5장 PC 이름, 3.2-3 [웨일ERP 열기]).
//! 새 라이브러리 없이 환경 변수와 운영체제 명령만 쓴다.

/// 웨일ERP 로그인 화면 주소. 화면은 주소를 넘기지 않으므로 이 상수만 열 수 있다.
// 실제 주소 확인 필요: `.invalid`는 어디로도 연결되지 않는 예약 주소다 (SPEC-login 13장 C).
const WHALE_ERP_URL: &str = "https://whale-erp.invalid/";

/// COMPUTERNAME(Windows) → HOSTNAME(그 밖) 순으로 고르고, 없거나 공백뿐이면 빈 문자열.
/// Linux에서 HOSTNAME은 보통 셸 변수라 비어 나올 수 있다 (배포 대상은 Windows).
fn pick_device_name(computername: Option<String>, hostname: Option<String>) -> String {
    [computername, hostname]
        .into_iter()
        .flatten()
        .map(|v| v.trim().to_string())
        .find(|v| !v.is_empty())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_device_name() -> String {
    pick_device_name(
        std::env::var("COMPUTERNAME").ok(),
        std::env::var("HOSTNAME").ok(),
    )
}

/// 프로그램을 껐다 다시 켠다 (스펙 2.4 다시시작). 새 플러그인 없이 Tauri 기본 기능만 쓴다.
/// `AppHandle::restart`는 새 프로세스를 못 띄워도 이 프로세스를 끝내 프로그램이 그냥 꺼지므로,
/// 새 프로세스를 먼저 띄워 보고 성공했을 때만 끝낸다. 실패하면 화면이 다시 시도할 수 있게 오류를 돌려준다.
/// 오류 문구에는 실행 파일 경로 · 인자를 넣지 않는다.
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let binary = tauri::process::current_binary(&app.env())
        .map_err(|_| "실행 파일 위치를 찾지 못했습니다.".to_string())?;
    std::process::Command::new(binary)
        .args(std::env::args_os().skip(1))
        .spawn()
        .map_err(|_| "새 프로그램을 시작하지 못했습니다.".to_string())?;
    app.exit(0);
    Ok(())
}

/// 운영체제가 정한 기본 브라우저로 웨일ERP를 연다. 여는 방식은 `open_log_dir`과 같다.
#[tauri::command]
pub fn open_whale_erp() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let program = "explorer.exe";
    #[cfg(target_os = "macos")]
    let program = "open";
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let program = "xdg-open";
    // explorer.exe는 성공해도 종료 코드 1을 돌려주므로 실행만 확인하고 기다리지 않는다.
    let mut child = std::process::Command::new(program)
        .arg(WHALE_ERP_URL)
        .spawn()
        .map_err(|e| format!("{program} 실행 실패: {e}"))?;
    // 끝난 프로세스가 좀비로 남지 않게 회수한다.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn some(v: &str) -> Option<String> {
        Some(v.to_string())
    }

    #[test]
    fn computername_wins_over_hostname() {
        assert_eq!(
            pick_device_name(some("POS-01"), some("linux-box")),
            "POS-01"
        );
    }

    #[test]
    fn falls_back_to_hostname_then_empty() {
        assert_eq!(pick_device_name(None, some("linux-box")), "linux-box");
        assert_eq!(pick_device_name(some("  "), some("linux-box")), "linux-box");
        assert_eq!(pick_device_name(None, None), "");
    }

    #[test]
    fn erp_url_is_a_fixed_https_address() {
        assert!(WHALE_ERP_URL.starts_with("https://"));
        assert!(!WHALE_ERP_URL.contains(char::is_whitespace));
    }
}
