---
type: Task Report
title: T11. 환경설정 — 프린터설정
description: 프린터 칸 3개 등록 · 해제, PC 파일 저장, Windows 일반 인쇄로 시험 인쇄를 만든다.
tags: [settings, printer, windows, tauri, react]
status: stable
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-17T13:07:50+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-settings-printer.md
    title: 스펙 — 환경설정 프린터설정 (2026-11-17 승인)
  - id: plan
    resource: /docs/plans/PLAN-settings-printer.md
    title: 구현 계획 (2026-11-17 승인)
  - id: task
    resource: plane:WHALEERPPO-12
    title: T11. 환경설정 — 프린터설정
  - id: screen
    resource: /docs/references/pickup-order-screen-spec-v0.8-260717.pdf
    title: 화면정의서 v0.8 p.19
verified:
  - by: human:yjnoh
    at: 2026-11-17T13:47:23+09:00
---

# 목표

주문서 · 영수증을 낼 프린터를 최대 3대 등록하고, 등록한 프린터로 시험 인쇄를 해서 연결을 확인한다. 커넥터가 없으므로 Windows "Microsoft Print to PDF"로 등록부터 시험 인쇄까지 확인할 수 있어야 한다.[^spec]

# 작업 내용

- 환경설정 > 프린터설정 하위 탭에 프린터 칸 3개를 만들었다. 빈 칸은 [+ 프린터 추가], 등록된 칸은 프린터 이름 · 용도 이름(연필로 수정) · 출력 항목(주문서, 영수증) · [시험 인쇄] · [연결 해제]를 보인다. 아래에 화면정의서 원문 그대로 "프린터 추가 방법" 세 줄을 보인다.[^screen]
- [+ 프린터 추가]는 앱 자체 팝업 "프린터 선택"을 띄우고, 이 PC의 Windows에 설치된 프린터 이름을 목록으로 보인다. 다른 칸에 등록된 프린터는 흐리게 보이고 누를 수 없다. 목록이 비었으면 "설치된 프린터가 없습니다.", 못 읽으면 "프린터 목록을 불러올 수 없습니다."[^spec]
- [시험 인쇄]는 Windows 일반 인쇄(GDI)로 맑은 고딕 글자 7줄(제목 · 프린터 · 용도 · 점포 · 시각 · 한글 문장 · 숫자)을 보낸다. 성공하면 "시험 인쇄를 보냈습니다."(인쇄 대기열에 넣었다는 뜻), 실패하면 "시험 인쇄에 실패했습니다. 프린터 연결과 드라이버를 확인해 주세요."[^spec]
- 설정은 바꾸는 즉시 이 PC의 `printer-settings.json`(앱 설정 폴더)에 저장되고 다시 켜도 유지된다. 저장 실패면 마지막으로 저장된 값으로 되돌리고 "설정을 저장하지 못했습니다.", 파일을 읽지 못하면 "설정을 불러오지 못했습니다."를 보이고 고치기를 막는다. Windows 목록에서 사라진 프린터는 칸에 남기고 "(찾을 수 없음)"을 붙인다.[^spec]
- 점포번호 계정은 설정을 바꿀 수 없고(화면정의서 p.8 "조회만"), 화면 맨 위에 "프린터 설정은 마스터 계정만 변경할 수 있습니다. 시험 인쇄는 가능합니다."를 보인다. 시험 인쇄는 된다.[^spec]
- Linux · macOS에서는 프린터 목록이 비어 있고 시험 인쇄는 "지원하지 않음" 오류다. 실제 동작은 Windows에서만 확인할 수 있다.

# 작업 방법

- 진행: 지휘 세션 `pos-boss`, 작업 세션 `t11-settings-printer-60`(이름을 `pos-T11`로 바꾸지 않은 채 진행. 워크트리에서 도는 Claude 프로세스가 하나뿐인 것을 확인하고 보냄), 워크트리 `~/.whale-smart-pos-worktrees/T11-settings-printer`, 브랜치 `feature/WHALEERPPO-12-settings-printer`
- 접근: T01 · T02와 같은 방식으로, 화면은 `PrinterApi` · `PrinterSettingsStore` 인터페이스만 부르고 Tauri 구현과 가짜 구현(테스트 · 브라우저 모드)을 둔다. Windows API(`EnumPrintersW`, `CreateDCW` · `StartDocW` · `TextOutW` 등)는 Rust `printer.rs`에서만 `cfg(windows)`로 부르고, 그 밖의 OS는 빈 목록 · 오류를 돌려준다. 설정 파일은 이미 있던 `serde_json`으로 임시 파일에 쓴 뒤 `sync_all` → 이름 바꾸기로 저장해 정전 때 빈 파일을 막는다.
- 라이브러리: `windows-sys` 0.61(기능 3개, Windows 빌드에만). Tauri 의존성이 이미 쓰는 버전이라 새로 받는 crate가 없다.
- 쓴 스킬 · 도구: incremental-implementation, test-driven-development, superpowers:requesting-code-review, pr-review-toolkit:review-pr, cargo-xwin(Linux에서 Windows 대상 clippy · 빌드). ponytail full 모드(양쪽 세션).
- 시도했다 버린 방법: 없음. 시험 인쇄 방식은 ESC/POS 직접 전송 대신 GDI를 골랐다(PDF 가상 프린터로 확인 가능, 한글은 Windows 글꼴). 실제 주문서 방식은 T12에서 다시 정한다.

# 변경 파일

- `src/shared/printer/printer-settings.ts`(+test): 설정 모양, 등록 · 해제 · 용도 · 체크 변경, 중복 등록 막기
- `src/shared/printer/printer-api.ts`: `PrinterApi` · `PrinterSettingsStore` 인터페이스, Tauri 구현, 가짜 · 메모리 구현
- `src/features/settings-printer/`: `PrinterSettingsScreen`(+test) · `PrinterSlotCard` · `PrinterPickerDialog` · `printer-texts` · `test-page`(+test)
- `src-tauri/src/printer.rs`: 프린터 목록 · GDI 시험 인쇄 (Windows 전용 + 그 밖의 OS)
- `src-tauri/src/printer_settings.rs`: 설정 파일 읽기 · 쓰기, 깨진 파일은 `.json.broken` 사본, 읽기 오류는 Err
- `src-tauri/src/lib.rs`: 명령 4개 등록. `src-tauri/Cargo.toml` · `Cargo.lock`: `windows-sys` 0.61(cfg(windows))
- `src/app/App.tsx`, `src/features/app-shell/AppShellContext.tsx` · `MainContent.tsx` · `AppShell.test.tsx`: 프린터 API 연결, [프린터설정] 탭에 화면 그리기
- 같이 커밋할 문서(`main` 쪽에서 고침): `docs/specs/SPEC-settings-printer.md`(2.4 · 2.5 · 3.1 · 8장 개정), `docs/tasks/T10-settings-widget.md`(점포번호 계정 안내 줄 결정)

# 검증

- pos-boss가 워크트리에서 직접 실행 (2026-11-17, Linux): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` 통과, `pnpm test` 140 passed, `pnpm build` 통과, `cargo fmt --check` 통과, `cargo clippy -- -D warnings` 통과, `cargo test` 16 passed
- 작업 세션 보고 (pos-boss 미실행): `cargo xwin clippy --target x86_64-pc-windows-msvc -- -D warnings` 경고 0, `pnpm tauri build --runner cargo-xwin` 설치 파일 빌드 성공(1.85 MiB), exe가 `EnumPrintersW` · `CreateDCW` · `StartDocW` · `TextOutW`를 가져오는 것 확인
- ② 리뷰: 지적 9건 → 고침 6 · 일부 고침 1(나머지는 A-2 결정으로 해결) · 체크리스트로 1 · 보류 1(③에서 고침). 안내 줄 추가분 ② 지적 0건
- ③ 리뷰(코드 · 테스트 · 오류 처리 · 주석 · 타입): 지적 34건 → 고침 25 · 보류 9 (아래 "남은 일 / 위험")
- 사용자 화면 확인 (Linux `pnpm tauri dev`): 칸 3개, 점포번호 계정에서 막힘과 안내 줄, 마스터 계정에서 [+ 프린터 추가] 팝업. 프린터가 없어 등록 · 시험 인쇄는 Linux에서 볼 수 없음
- Windows 실제 실행은 하지 않았다 (사용자 요청으로 보류, 커넥터 구매 뒤)

# 결정 사항

- 같은 프린터 두 칸 금지, 연결 해제는 확인 없이, 새 칸 기본값(주문서 체크 · 영수증 해제 · 용도 빈칸), 모든 칸에 영수증 체크, 사라진 프린터는 "(찾을 수 없음)"으로 유지 (스펙 8장 임시 결정, 사용자 승인 2026-11-17)[^spec]
- 등록된 프린터는 팝업에서 흐리게 남김, 용도 앞뒤 공백 제거, 목록 오류 때 "(찾을 수 없음)" 안 붙임 (작업 세션 판단, 사용자 "A-1" 2026-11-17)
- 설정 파일 읽기 오류면 덮어쓰기를 막는다 (사용자 "A-2" 2026-11-17)[^spec]
- 점포번호 계정 안내 줄, T10에도 같은 방식 (사용자 "A-1, B-2, C-1" 2026-11-17)[^spec]
- 범위는 T11 전체 + 시험 인쇄, 시험 인쇄는 Windows 일반 인쇄(GDI), Windows 라이브러리는 `windows` 또는 `windows-sys` 허용, 저장은 이 PC, 시험 인쇄는 점포번호 계정도 가능 (사용자 결정 2026-11-17)[^spec]

# 남은 일 / 위험

- **Windows 확인 체크리스트 10개** (작업 세션 작성, 커넥터 구매 뒤): 1) 칸 3개 · 안내 2) 팝업에 "Microsoft Print to PDF" 등 목록, 등록된 것은 흐림 3) 등록 · 한글 용도(터치 키보드 포함) · 체크 → 재실행 뒤 유지, `%APPDATA%\com.whale.pickuporder.dev\printer-settings.json` 생성 4) PDF 시험 인쇄: 저장 창이 앱 앞에 뜨는지, 한글 7줄이 맑은 고딕으로 5) 저장 창 [취소] → 실패 문구, 버튼 다시 눌림 6) 프린터를 지우고 재실행 → "(찾을 수 없음)", 시험 인쇄 실패 7) 체크 상자 연타 → 멈칫 없음, 마지막 상태 유지 8) 점포번호 계정: 시험 인쇄만 됨 + 안내 줄 9) 스풀러 중지 → 목록 오류 문구 10) SLK-TS100 설치 뒤 2 · 4번 반복(한글, 긴 줄, 커팅)
- **릴리스 Windows 빌드는 오류 로그가 어디에도 남지 않는다** (`eprintln` · `console.error`). 프로젝트 공통 로그 방식(새 라이브러리 필요)을 정해야 한다 (③ 보류)
- 저장이 끝나기 전에 탭을 떠나면 저장 실패 문구를 못 본다 (가능성 낮음, ③ 보류)
- 저장이 메인 스레드에서 `sync_all`을 기다려 느린 PC에서 멈칫할 수 있다 → 체크리스트 7번 (③ 보류)
- 그 밖의 ③ 보류: Tauri 명령 이름 · 인자 테스트 없음(기존 방식과 같음), 용도 공백만 입력 테스트 없음, 중복 클릭 ref 방어 별도 테스트 없음, 막힌 버튼 경로의 throw 미처리, `.json.broken`은 마지막 사본 하나만, 목록 오류 문구 안내 부족(임시 문구)
- 기획자 답 대기: Q15(저장 위치), Q45(여러 대 · 슬롯 2 영수증 · 저장 · 시험 인쇄 · 용지 폭), Q46(오른쪽 설정 영역), Q47(출력 실패 알림). 답이 오면 스펙부터 고친다
- 실제 주문서 · 영수증 출력과 방식(GDI vs ESC/POS)은 T12

# 히스토리

- 2026-11-17T12:56+09:00 사용자 결정: 범위 A-1, 시험 인쇄 방식 B-1(GDI), 라이브러리 C-1, 저장 D-1(PC), 시험 인쇄 권한 E-1
- 2026-11-17T13:01+09:00 스펙 승인 (사용자)
- 2026-11-17T13:02+09:00 계획 승인 (사용자 "A-1") → 스펙 · 계획 커밋 `14f122a`, Plane WHALEERPPO-12 In Progress, 워크트리 생성
- 2026-11-17T13:09+09:00 세션 열림 확인 (사용자 "세션 열었어" 13:07) → 지시서 전달 (pos-boss → t11-settings-printer-60)
- 2026-11-17T13:09+09:00 작업 세션 회신: 받음. 0단계 보고는 13:40쯤 예정, 그동안 1 · 2단계를 TDD로 진행
- 2026-11-17T13:10+09:00 0단계 보고: windows-sys 0.61 추천 (이미 Cargo.lock에 0.61.2, 새 crate 없음, 기능 3개만 추가) → pos-boss가 lock과 함수 위치 확인 → 사용자 승인 "A-1" → 작업 세션에 전달
- 2026-11-17T13:11+09:00 작업 세션 회신: ponytail full 모드 켜짐(세션 시작 훅), 스펙 우선 확인. 1단계 거의 끝 (TS 테스트 6개, Rust 설정 파일 테스트 5개 통과, 보고 기준)
- 2026-11-17T13:15+09:00 확인 지점 1 보고: 1 · 2단계 끝, ① 전부 통과 (보고). pos-boss 직접 실행: `pnpm test` 133 passed, `cargo test` 10 passed. 판단 사항 5개 보고 (등록된 프린터는 팝업에 흐리게 남김, 용도 앞뒤 공백 제거, 목록 오류 시 "(찾을 수 없음)" 안 붙임, 새 Tauri 권한 없음, 화면 눈 확인은 3단계 뒤)
- 2026-11-17T13:18+09:00 판단 사항 5개 → 사용자 "A-1" (그대로 둔다) → 작업 세션에 전달
- 2026-11-17T13:23+09:00 3단계 끝 (보고): printer.rs(EnumPrintersW 레벨 4, GDI 시험 인쇄, 실패 시 AbortDoc · DeleteDC), windows-sys 0.61 cfg(windows) 추가, Windows 대상 clippy 경고 0, cargo-xwin 설치 파일 빌드
- 2026-11-17T13:23+09:00 ② 리뷰: 지적 9건 → 고침 6 · 일부 고침 1(깨진 파일 .broken 사본) · 체크리스트로 1(PDF 저장 창) · 보류 1(GDI 오류 코드 없는 경우 로그 문구) (보고). ① 다시 통과: test 135, cargo test 13 (보고)
- 2026-11-17T13:23+09:00 작업 세션 질문: 설정 파일 읽기 오류(파일 없음 · 모양 틀림이 아닌 경우) 처리 → 사용자에게 문의
- 2026-11-17T13:24+09:00 사용자 답 "A-2": 읽기 오류면 "설정을 불러오지 못했습니다." + 고치기 · 시험 인쇄 막기, 탭을 다시 열면 다시 읽기 → pos-boss가 main의 스펙 2.5 · 3.1 · 8장 수정(커밋 전) → 작업 세션에 전달
- 2026-11-17T13:32+09:00 완료 보고 (작업 세션): 스펙 7장 1~7 됨(Linux 범위), ③ 지적 34건 → 고침 25 · 보류 9, Windows 체크리스트 10개
- 2026-11-17T13:32+09:00 pos-boss 직접 확인: lint · typecheck · format:check 통과, `pnpm test` 139 passed, build 통과, cargo fmt · clippy -D warnings 통과, `cargo test` 16 passed. diff 확인 (windows-sys cfg(windows)만, 명령 4개 등록)
- 2026-11-17T13:32+09:00 사용자 요청으로 exe 빌드 생략, Linux `pnpm tauri dev`로 화면 띄움 (사용자 확인 중)
- 2026-11-17T13:39+09:00 사용자 화면 확인: 점포번호 계정(자동 로그인)에서 [+ 프린터 추가]가 안 눌림 → 스펙 2.4대로 막힌 것, 마스터 계정에서 정상 동작 확인
- 2026-11-17T13:39+09:00 사용자 결정 A-1 · B-2 · C-1: 점포번호 계정이면 화면 맨 위 안내 줄 "프린터 설정은 마스터 계정만 변경할 수 있습니다. 시험 인쇄는 가능합니다." (팝업 아님), T10 위젯설정에도 같은 방식 → pos-boss가 main의 스펙 2.4 · 8장, T10 태스크 문서 수정(커밋 전) → 작업 세션에 전달
- 2026-11-17T13:40+09:00 안내 줄 반영 보고: printer-texts · PrinterSettingsScreen · 테스트 1개, ② 지적 0건 (보고). pos-boss 직접 확인: lint · typecheck · format:check 통과, `pnpm test` 140 passed, 문구 원문 일치
- 2026-11-17T13:44+09:00 OKF 본문 작성 (pos-boss). 사용자는 시험 인쇄 버튼 · Windows 확인을 나중에 하기로 함
- 2026-11-17T13:47+09:00 사용자 "커밋하고 머지해" → 커밋 `ce22e81`(feat) · `d4f01dc`(OKF), main에 fast-forward 머지, main에서 스펙 개정 커밋 `c973557`. 머지된 main에서 `pnpm test` 140 passed, `cargo test` 16 passed
- 2026-11-17T13:47+09:00 사용자 OKF 승인 ("A-1"), Plane WHALEERPPO-12 Done ("B-1", Windows 확인 체크리스트는 남은 일로 유지)

[^spec]: `docs/specs/SPEC-settings-printer.md`
[^screen]: 화면정의서 v0.8 p.19
