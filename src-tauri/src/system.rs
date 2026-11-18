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
