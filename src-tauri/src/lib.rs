use tauri::Manager;

mod auto_login;
mod log_viewer;
mod print_layout;
mod printer;
mod printer_settings;
mod system;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();
    tauri::Builder::default()
        .plugin(build_log_plugin())
        // 본 창이 없어지면 위젯 창도 같이 닫는다. 안 그러면 위젯 창만 남아 프로그램이 끝나지 않는다 (T06 스펙 3.1).
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed)
                && closes_widget_with(window.label())
                && let Some(widget) = window.app_handle().get_webview_window("widget")
            {
                // 못 닫으면 위젯 창만 남아 프로그램이 안 끝난다. 이유를 남기고 프로그램을 직접 끝낸다.
                if let Err(e) = widget.destroy() {
                    log::error!("[widget] 본 창 종료 때 위젯 창 닫기 실패: {e}");
                    window.app_handle().exit(0);
                }
            }
        })
        // 앱 자체 명령은 capability 없이 모든 창에서 부를 수 있다 (Tauri v2 기본값,
        // https://v2.tauri.app/security/capabilities/). build.rs에서 AppManifest::commands를 쓰면 바뀐다.
        .invoke_handler(tauri::generate_handler![
            auto_login::save_refresh_token,
            auto_login::load_refresh_token,
            auto_login::clear_refresh_token,
            printer::list_printers,
            printer::print_document,
            printer_settings::load_printer_settings,
            printer_settings::save_printer_settings,
            log_viewer::read_recent_logs,
            log_viewer::open_log_dir,
            system::get_device_name,
            system::open_whale_erp,
            system::restart_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 이 창이 없어질 때 위젯 창도 닫아야 하는지. 위젯 자신이 없어질 때는 아니다.
fn closes_widget_with(label: &str) -> bool {
    label == "main"
}

// 파일 크기 · 보관 · 시간은 스펙 2.2. 파일 이름은 임시로 "app"(날짜 이름 방식은 결정 대기).
// 기본 타깃(Stdout + LogDir) 중 파일만 쓴다. info 미만(debug 등)은 남기지 않는다.
fn build_log_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some(log_viewer::LOG_FILE_STEM.into()),
        }))
        .level(log::LevelFilter::Info)
        .max_file_size(5 * 1024 * 1024)
        // 현재 파일 1개 + 회전 파일 5개까지 남는다 (소스 확인, 약 30MB).
        .rotation_strategy(RotationStrategy::KeepSome(5))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

/// panic 메시지 글. `panic!("...")`는 &str, `panic!("{x}")`는 String으로 온다.
fn payload_text(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "알 수 없는 panic".to_string()
    }
}

// Windows 릴리스 빌드는 콘솔이 없어 panic 메시지가 사라진다. 파일에 남기고 원래 동작은 이어서 한다.
fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let place = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_default();
        log::error!("[panic] {} ({place})", payload_text(info.payload()));
        previous(info);
    }));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn widget_closes_only_with_the_main_window() {
        assert!(closes_widget_with("main"));
        assert!(!closes_widget_with("widget"));
    }

    #[test]
    fn panic_payload_text_for_str_and_string() {
        let a = std::panic::catch_unwind(|| panic!("고정 문구")).unwrap_err();
        assert_eq!(payload_text(&*a), "고정 문구");
        let n = 3;
        let b = std::panic::catch_unwind(|| panic!("값 {n}")).unwrap_err();
        assert_eq!(payload_text(&*b), "값 3");
        let c = std::panic::catch_unwind(|| std::panic::panic_any(7u8)).unwrap_err();
        assert_eq!(payload_text(&*c), "알 수 없는 panic");
    }
}
