---
type: Task Report
title: T11. 프린터설정 개편 (기획자 답변 반영)
description: 두 계정 모두 프린터 설정 변경, 용지 폭 58/80mm, 저장 토스트, 주문서 프린터 없음 안내로 프린터설정을 고친다.
tags: [printer, settings, tauri, react]
status: stable
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-18T11:08:35+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-settings-printer.md
    title: 스펙 — 프린터설정 (2026-11-18 개정 승인)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q10 · Q15 · Q45 · Q46
  - id: task
    resource: plane:WHALEERPPO-12
    title: T11. 환경설정 — 프린터설정
  - id: prev
    resource: /docs/okf/2026-11-17-settings-printer.md
    title: 처음 구현 보고서
verified:
  - by: human:yjnoh
    at: 2026-11-18T11:31:42+09:00
---

# 목표
기획자 답변(Q10 · Q15 · Q45 · Q46)에 맞춰 2026-11-17에 만든 프린터설정을 고친다. 완료 기준은 SPEC-settings-printer.md 7장 1~7(5-1 포함)[^spec].

# 작업 내용
- 점포번호 계정도 프린터 등록 · 해제 · 용도 · 체크 · 시험 인쇄를 모두 할 수 있다. "마스터 계정만" 안내 줄과 버튼 흐리게 하기를 지웠다
- 칸마다 용지 폭 58 / 80mm 라디오를 넣었다 (새 칸 기본 80, 저장만 하고 T12가 쓴다)
- 저장에 성공하면 화면 아래 가운데에 "저장되었습니다" 토스트가 2초 동안 보인다 (공용 `Toast`, T09도 쓴다)
- 「주문서」 체크된 칸이 하나도 없으면 칸 위에 "주문서를 출력할 프린터가 없습니다. …" 안내가 보인다
- 2026-11-17 판 설정 파일(용지 폭 없음)은 지우지 않고 80mm로 채워 읽는다
- 깨진 설정 파일의 사본(`.broken`)이 이미 있으면 덮어쓰지 않아 처음 원인을 남긴다
- 깨진 설정 파일 로그에 파일 안의 값(프린터 이름 · 용도 문구)이 들어가지 않는다 ("오류 문구에 입력값을 넣지 않는다" 규칙)

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t11-printer-revision-d3`(Orca로 실행), 워크트리 `~/.whale-smart-pos-worktrees/T11-printer-revision`, 브랜치 `feature/WHALEERPPO-12-printer-revision`
- 접근: 기존 구조(PrinterApi · PrinterSettingsStore, Rust `printer_settings.rs`)를 유지했다. 옛 파일 보호는 Rust serde 기본값(80)과 58 · 80 검증으로, 화면 쪽은 `hasOrderPrinter`로 안내를 판단했다. 권한 코드는 쓸모가 없어져 지웠고 `canEditSetting` 함수는 T10 · T13용으로 남겼다
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review(②), pr-review-toolkit:review-pr(③). 구현은 Sonnet 5.5, 리뷰 서브에이전트는 Opus. 작업 세션은 처음으로 지휘 세션이 Orca(`orca-ide agent launch`)로 열었다

# 변경 파일
- `src-tauri/src/printer_settings.rs`: `paper_width`(serde 기본 80, 58 · 80 검증, 칸 번호를 넣은 오류 문구), `.broken` 사본이 있으면 덮어쓰지 않음, 모양 오류 로그에서 serde 원문을 빼고 분류 · 줄 · 열만 남김, 테스트 6개 추가
- `src/shared/printer/printer-settings.ts`(+테스트): `PAPER_WIDTHS` · `PaperWidth`, `hasOrderPrinter`, 새 칸 용지 폭 80
- `src/shared/ui/Toast.tsx`(+테스트, 새 파일): 아래 가운데 · 2초 · 닫기 없음 · `role="status"`
- `src/features/settings-printer/PrinterSettingsScreen.tsx`(+테스트): 권한 제거, 토스트, 주문서 프린터 없음 안내
- `src/features/settings-printer/PrinterSlotCard.tsx`: 용지 폭 라디오, `canEdit` → `disabled`(설정 읽기 실패 때만)
- `src/features/settings-printer/printer-texts.ts`: 문구 3개 추가, 점포 계정 안내 문구 삭제
- `src/features/app-shell/MainContent.tsx`: `canEditSetting` 호출 삭제
- `src/shared/session/permissions.ts`: 주석만

# 검증
- pos-boss가 워크트리에서 직접 실행 (2026-11-18): `pnpm lint` · `typecheck` · `format:check` 통과, `pnpm test` 21파일 203개 통과, `pnpm build` 통과, `cargo fmt --check` · `cargo clippy -- -D warnings` 통과, `cargo test` 34개 통과. 소스에 "마스터 계정만" · `canEdit` 사용 없음
- ② (Opus): 지적 6건 → 고침 4(저장 실패 시 토스트 동시 표시 등) · 보류 2(빈 `role="status"` 칸 상시 두기는 T09와 같이 정함, 11-17판 앱으로 되돌리면 새 파일이 깨진 파일로 보임). B-2 반영 뒤 재리뷰 지적 3건(Minor) → 보류 3(사본 자리에 폴더가 있을 때 로그 문구, exists와 copy 사이 경쟁, 스펙 문구 → pos-boss가 main 스펙 3.1에 추가)
- ③ (Opus 5종: code · test · silent-failure · comment · type-design): Important 8 · Minor 약 20 → 대부분 고침(주문서 판단 테스트 보강, 토스트 테스트, 오래된 주석, Rust 오류 문구 칸 번호 등). 보류: SlotPatch 타입 구멍(전역 설정 필요), 저장 성공 콜백 순서 확인(Rust 저장이 동기라 보장), 프린터 목록을 못 읽으면 "(찾을 수 없음)" 미표시(기존 동작)
- Windows 수동 확인 (사용자에게 요청):
  1. "저장되었습니다" 토스트가 아래 가운데에 뜨고 2초 뒤 사라지는지, 연달아 바꿀 때 겹치지 않는지 (터치)
  2. 용지 폭 라디오를 손가락으로 누르기 편한지, 칸마다 따로 저장되는지
  3. 프로그램 종료 후 다시 켜도 용지 폭 · 체크 · 용도가 유지되는지
  4. (중요) 11-17판 설정 파일로 켜면 프린터가 지워지지 않고 80mm로 보이며 `.broken`이 생기지 않는지
  5. 주문서 체크를 모두 풀면 안내가 보이고, 하나 체크하면 사라지는지
  6. 점포번호 계정으로 프린터 추가 · 해제 · 시험 인쇄가 되고 "마스터 계정만" 줄이 없는지
  7. "Microsoft Print to PDF" 시험 인쇄 (용지 폭 58이어도 페이지 모양은 그대로)
  8. (가능하면) 화면 읽기 프로그램이 토스트를 읽는지

# 결정 사항
- 권한 막기 코드와 안내 줄은 지운다, 토스트는 화면 아래 가운데 2초, 용지 폭은 저장만 (2026-11-18 사용자)[^spec]
- 용지 폭 값이 틀린 파일은 스펙대로 깨진 파일 처리(A-1), `.broken` 사본은 이미 있으면 덮어쓰지 않음(B-2) (2026-11-18 사용자)

# 남은 일 / 위험
- 여러 프린터 출력 규칙 · 출력 실패 알림은 T12
- 설정 파일의 용지 폭 값 하나만 틀려도(예: 72) 파일 전체를 깨진 파일로 보고 칸 3개를 비운다. 그 상태에서 고치면 나머지 칸이 덮어써진다(`.broken` 사본은 남음). 사용자 결정 A-1로 스펙대로 유지
- 11-17판 앱으로 되돌리면 새 파일(용지 폭 있음)을 깨진 파일로 볼 수 있다 (version 1 유지 결정의 결과)
- UTF-8이 아닌 설정 파일(메모장 CP949 저장 등)은 읽기 오류로 처리되어 화면이 "설정을 불러오지 못했습니다" 상태가 된다 (기존 동작, 덮어쓰지 않는 쪽이라 안전)

# 히스토리
- 2026-11-18T11:08+09:00 지휘 세션이 Orca(`orca-ide agent launch`)로 작업 세션을 Sonnet 5.5로 열고 지시서 전달
- 2026-11-18T11:09+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인. /rename은 세션 도구로 못 함
- 2026-11-18T11:19+09:00 작업 세션 보고: 구현 · ① 통과, ② Opus 지적 6건 → 고침 4 · 보류 2, ③ Opus 5종 Important 8 · Minor 약 20 → 대부분 고침. 질문 2개(용지 폭 값이 틀린 파일 처리, .broken 사본 덮어쓰기)
- 2026-11-18T11:19+09:00 pos-boss 직접 확인: lint · typecheck · format 통과, test 21파일 203개 통과, build 통과, cargo fmt · clippy 통과, cargo test 32개 통과. 소스에 "마스터 계정만" · canEdit 사용 없음
- 2026-11-18T11:20+09:00 사용자 답: A-1(용지 폭 틀린 파일은 그대로), B-2(.broken 덮어쓰지 않음)
- 2026-11-18T11:23+09:00 작업 세션 보고: B-2 반영, ① 통과, ② 재리뷰 지적 3건 → 보류 3. pos-boss 직접 확인: ① 전부 통과(test 203개, cargo test 33개). 스펙 3.1에 사본 규칙 추가(main)
- 2026-11-18T11:24+09:00 사용자 C-1: 깨진 설정 파일 로그에서 파일 값을 빼기로 함 → 작업 세션에 지시
- 2026-11-18T11:27+09:00 작업 세션 보고: C-1 반영, ② 재리뷰 지적 5건 → 고침 1(가짜 통과 테스트 교체) · 보류 4. pos-boss 직접 확인: ① 전부 통과(test 203개, cargo test 34개)
- 2026-11-18T11:30+09:00 사용자 "커밋하고 머지해" → 커밋 `0ef1f2f`(코드) · `137c0c6`(OKF), main 스펙 `1eaecfa`
- 2026-11-18T11:30+09:00 머지 `17f8c99`, main에서 test 203개 통과
- 2026-11-18T11:31+09:00 사용자 OKF 승인 (status: stable)

[^spec]: SPEC-settings-printer.md 12장
