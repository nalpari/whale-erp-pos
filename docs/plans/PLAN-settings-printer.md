# 구현 계획: 환경설정 — 프린터설정 (`settings-printer`, T11)

- **스펙**: `docs/specs/SPEC-settings-printer.md` (2026-11-17 승인)
- **Plane**: WHALEERPPO-12. Plane에는 태스크(T11) 하나만 두고, 아래 단계는 이 문서의 체크리스트로 관리한다.
- **선행**: T01 · T02가 `main`에 있다 (완료).
- **상태**: 승인 (2026-11-17, 사용자)

## 개요

프린터설정 하위 탭에 프린터 칸 3개를 만들고, Windows 프린터 목록에서 등록하고, 설정을 PC 파일에 저장하고, 등록한 프린터로 시험 인쇄를 한다. 커넥터가 없으므로 Windows의 "Microsoft Print to PDF"로 확인한다.

## 구조 결정

- 화면 코드는 `PrinterApi` · `PrinterSettingsStore` 인터페이스만 부른다. Tauri 구현과 가짜 구현(테스트 · 브라우저 개발 모드)을 둔다 (스펙 3.2).
- Windows API는 Rust에서만 부른다. Windows가 아닌 OS에서는 빈 목록 · "지원하지 않음" 오류 (스펙 3.3).
- 설정 파일은 `app_config_dir`의 `printer-settings.json`, `serde_json`으로 읽고 쓴다. 새 라이브러리 · 플러그인 없음.
- 권한은 T02의 `canEditSettings`를 쓴다.

## 단계

### 0단계. Windows 라이브러리 선택 보고 (코드 없음, 맨 앞)

- 완료 기준
  - [ ] 프린터 목록(EnumPrinters 등)과 GDI 인쇄(CreateDC, StartDoc, TextOut 등)에 필요한 API를 Microsoft 공식 문서로 확인
  - [ ] `windows`와 `windows-sys` 중 무엇을 쓸지, 버전, 필요한 기능(feature), Tauri가 이미 쓰는 버전과의 관계를 pos-boss에 보고하고 승인을 기다림
- 크기: XS
- 승인을 기다리는 동안 1 · 2단계를 진행한다.

### 1단계. 설정 모양과 저장

- 완료 기준
  - [ ] `PrinterSettings` 모양과 등록 · 해제 · 용도 · 체크 변경, 중복 등록 막기 (스펙 3.1, 2.2)
  - [ ] `PrinterSettingsStore` 인터페이스 + 메모리 구현 + Tauri 구현
  - [ ] Rust `load_printer_settings` · `save_printer_settings`: 없음 · 깨진 파일이면 빈 설정, 깨진 파일은 지우지 않음 (스펙 3.1)
- 검증: 단위 테스트, `cargo test`
- 크기: M

### 2단계. 프린터설정 화면 (가짜 PrinterApi로)

- 완료 기준
  - [ ] 칸 3개, 제목, 용도 이름 고치기(Enter · Esc · 칸 밖), 출력 항목 체크, [연결 해제], [+ 프린터 추가] (스펙 2.1)
  - [ ] 프린터 선택 팝업: 목록 · 빈 목록 · 오류 문구, 이미 등록된 프린터 제외 (스펙 2.2)
  - [ ] 바로 저장, 저장 실패 시 되돌림과 문구, "(찾을 수 없음)" (스펙 2.5)
  - [ ] 점포번호 계정은 설정 입력 막힘 (스펙 2.4)
  - [ ] 안내 문구 원문 (스펙 2.1-4)
- 검증: 화면 테스트, `pnpm dev`
- 크기: M

### 확인 지점 1 (1 · 2단계 뒤)

- [ ] ① 통과
- [ ] 작업 세션이 pos-boss에 중간 보고

### 3단계. 프린터 목록과 시험 인쇄 (0단계 승인 뒤)

- 완료 기준
  - [ ] Rust `list_printers`: Windows는 설치된 프린터 이름, 그 밖의 OS는 빈 배열
  - [ ] Rust `print_test_page`: Windows는 GDI로 "맑은 고딕" 글자를 그려 인쇄, 그 밖의 OS는 "지원하지 않음" 오류
  - [ ] 시험 페이지 줄 만들기(용도 빈 값이면 줄 뺌), [시험 인쇄] 성공 · 실패 문구, 보내는 중 다시 누르기 막기, 점포번호 계정도 가능 (스펙 2.3, 2.4)
  - [ ] 필요한 Tauri 권한만 열기
  - [ ] Linux에서 `cargo-xwin`으로 Windows 대상 빌드가 되는지 확인 (`AGENTS.md` "Windows 설치 파일 만들기")
- 검증: 단위 · 화면 테스트, `cargo test`, Windows 대상 빌드
- 크기: M

### 확인 지점 2 (완료)

- [ ] 스펙 7장 완료 기준 1~7
- [ ] ① → ② `superpowers:requesting-code-review` → ③ `pr-review-toolkit:review-pr` → ① 다시
- [ ] Windows 확인 체크리스트 작성 (프린터 목록, "Microsoft Print to PDF" 시험 인쇄의 한글, 재실행 뒤 설정 유지, 커넥터 구매 뒤 SLK-TS100 확인)
- [ ] pos-boss가 diff와 명령 결과 확인, setup.exe 빌드, OKF 보고서 완성

## 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| Linux에서 Windows 인쇄 코드를 실행해 볼 수 없음 | 중 | Windows 전용 코드는 작게 두고, 그 위 로직은 OS와 무관하게 테스트. `cargo-xwin`으로 컴파일까지 확인하고 Windows에서 수동 확인 |
| GDI 인쇄에서 영수증 용지 폭 · 커팅이 드라이버마다 다름 | 낮음 | 시험 인쇄는 확인용이라 왼쪽 위에 작은 글자로 찍는다. 주문서 양식은 T12에서 다룬다 |
| 기획자 답(Q15, Q45~47)으로 동작이 바뀜 | 중 | 임시 결정은 스펙 8장에 표시했고, 답이 오면 스펙 → 계획 순서로 고친다 |

## 진행 방식

- 워크트리 `~/.whale-smart-pos-worktrees/T11-settings-printer`, 브랜치 `feature/WHALEERPPO-12-settings-printer`, 작업 세션 `pos-T11` 하나.
- 단계 순서: 0(보고) → 1 → 2 → (확인 지점 1) → 3 → (확인 지점 2).
