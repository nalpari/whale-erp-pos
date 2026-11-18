//! 자동 로그인 재발급 토큰을 OS 보안 저장소(Windows 자격 증명 관리자)에 저장한다 (스펙 4장).
//! 매장 프로그램 비밀번호는 여기로 오지 않는다. 토큰 값은 로그와 오류 문구에 넣지 않는다.

/// 키링 항목의 서비스 이름. 앱 식별자(tauri.conf.json `identifier`)와 같게 둔다.
/// 식별자는 임시값이라, 바꾸면 이 값도 함께 바꿔야 한다 (바꾸면 이전에 저장한 토큰은 읽지 못한다).
const SERVICE: &str = "com.whale.pickuporder.dev";
/// 키링 항목의 계정 이름. 점포 PC 한 대에 토큰 하나만 둔다.
const ACCOUNT: &str = "refresh-token";

/// 보안 저장소. 테스트에서 가짜로 바꾸려고 둔다.
pub trait SecretStore {
    fn set(&self, value: &str) -> Result<(), String>;
    /// 저장된 값이 없으면 `Ok(None)`.
    fn get(&self) -> Result<Option<String>, String>;
    /// 저장된 값이 없어도 성공으로 본다.
    fn delete(&self) -> Result<(), String>;
}

/// 실제 OS 보안 저장소. Windows는 자격 증명 관리자, Linux 개발 PC는 Secret Service(gnome-keyring).
pub struct KeyringStore;

impl KeyringStore {
    fn entry() -> Result<keyring::Entry, String> {
        // 저장소 초기화가 실패하면 Entry::new는 원인 없이 NoDefaultStore만 돌려준다. 진짜 원인을 함께 보낸다.
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| match keyring::Entry::store_status() {
            Err(init) => format!("보안 저장소 초기화 실패: {init}"),
            Ok(()) => e.to_string(),
        })
    }
}

impl SecretStore for KeyringStore {
    fn set(&self, value: &str) -> Result<(), String> {
        Self::entry()?
            .set_password(value)
            .map_err(|e| e.to_string())
    }

    fn get(&self) -> Result<Option<String>, String> {
        match Self::entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn delete(&self) -> Result<(), String> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

fn save(store: &dyn SecretStore, token: &str) -> Result<(), String> {
    // 빈 토큰을 저장하면 다음 실행 때 자동 로그인이 늘 실패하므로 받지 않는다.
    if token.is_empty() {
        return Err("빈 토큰은 저장하지 않습니다.".into());
    }
    store.set(token)
}

fn load(store: &dyn SecretStore) -> Result<Option<String>, String> {
    // 빈 값이 들어 있으면 없는 것으로 본다.
    Ok(store.get()?.filter(|t| !t.is_empty()))
}

// 명령을 async가 아닌 동기 함수로 둔다. Tauri v2는 동기 명령을 메인 스레드에서 실행하므로, Rust에 도착한
// 순서대로 처리된다("로그아웃 삭제 → 다시 로그인 저장"이 뒤섞이지 않는다). async로 바꾸지 말 것.
// 대가: 키링 호출 동안 메인 스레드가 잠깐 멈춘다. Windows 자격 증명 관리자는 빨라 문제가 작다.
#[tauri::command]
pub fn save_refresh_token(token: String) -> Result<(), String> {
    save(&KeyringStore, &token)
}

#[tauri::command]
pub fn load_refresh_token() -> Result<Option<String>, String> {
    load(&KeyringStore)
}

#[tauri::command]
pub fn clear_refresh_token() -> Result<(), String> {
    KeyringStore.delete()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    /// 메모리 가짜 저장소. `fail`이면 모든 호출이 실패한다.
    #[derive(Default)]
    struct FakeStore {
        value: RefCell<Option<String>>,
        fail: bool,
    }

    impl SecretStore for FakeStore {
        fn set(&self, value: &str) -> Result<(), String> {
            if self.fail {
                return Err("저장소 오류".into());
            }
            *self.value.borrow_mut() = Some(value.to_string());
            Ok(())
        }
        fn get(&self) -> Result<Option<String>, String> {
            if self.fail {
                return Err("저장소 오류".into());
            }
            Ok(self.value.borrow().clone())
        }
        fn delete(&self) -> Result<(), String> {
            if self.fail {
                return Err("저장소 오류".into());
            }
            *self.value.borrow_mut() = None;
            Ok(())
        }
    }

    #[test]
    fn 저장한_토큰을_읽고_지우면_없다() {
        let store = FakeStore::default();
        save(&store, "token-1").unwrap();
        assert_eq!(load(&store).unwrap(), Some("token-1".into()));
        store.delete().unwrap();
        assert_eq!(load(&store).unwrap(), None);
    }

    #[test]
    fn 빈_토큰은_저장하지_않는다() {
        let store = FakeStore::default();
        assert!(save(&store, "").is_err());
        assert_eq!(load(&store).unwrap(), None);
    }

    #[test]
    fn 저장된_빈_값은_없는_것으로_본다() {
        let store = FakeStore::default();
        store.set("").unwrap();
        assert_eq!(load(&store).unwrap(), None);
    }

    #[test]
    fn 저장소_오류는_그대로_돌려준다() {
        let store = FakeStore {
            fail: true,
            ..Default::default()
        };
        assert!(save(&store, "t").is_err());
        assert!(load(&store).is_err());
    }

    #[test]
    fn 서비스_이름은_앱_식별자와_같다() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["identifier"], SERVICE);
    }
}
