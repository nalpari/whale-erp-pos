mod auto_login;
mod printer;
mod printer_settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 앱 자체 명령은 capability 없이 모든 창에서 부를 수 있다 (Tauri v2 기본값,
        // https://v2.tauri.app/security/capabilities/). build.rs에서 AppManifest::commands를 쓰면 바뀐다.
        .invoke_handler(tauri::generate_handler![
            auto_login::save_refresh_token,
            auto_login::load_refresh_token,
            auto_login::clear_refresh_token,
            printer::list_printers,
            printer::print_test_page,
            printer_settings::load_printer_settings,
            printer_settings::save_printer_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
