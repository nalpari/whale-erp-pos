---
type: Task Report
title: T02. 로그인 개편 (기획자 답변 반영)
description: 점포코드 + 매장 프로그램 비밀번호 로그인, 웨일ERP 계정 탭, 점포번호 찾기 삭제, 오류 문구 6개, 점포코드 기억, 설정별 권한으로 로그인을 고친다.
tags: [login, session, auth, tauri, react]
status: stable
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-18T10:14:10+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-login.md
    title: 스펙 — 로그인 (2026-11-18 개정 승인)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q06 · Q09~Q15
  - id: task
    resource: plane:WHALEERPPO-3
    title: T02. 로그인
  - id: prev
    resource: /docs/okf/2026-11-16-login.md
    title: 처음 구현 보고서
verified:
  - by: human:yjnoh
    at: 2026-11-18T10:59:00+09:00
---

# 목표
기획자 답변(Q06 · Q09~Q15)에 맞춰 2026-11-16에 만든 로그인을 고친다. 완료 기준은 SPEC-login.md 9장 1~8[^spec].

# 작업 내용
- 점포번호 탭: 점포코드(자유 입력, 소문자 → 대문자, 앞뒤 공백 제거, 20자) + 매장 프로그램 비밀번호(가림 + 눈 아이콘, 20자)로 로그인한다
- 두 번째 탭을 "웨일ERP 계정으로 로그인"(아이디 + 비밀번호 + 점포코드, 세 칸이 차야 활성, 자동 로그인 없음)으로 바꿨다
- 점포번호 찾기 팝업을 지우고 탭마다 안내 한 줄을 넣었다. 웨일ERP 탭에는 [웨일ERP 열기](기본 브라우저, 주소는 임시값)가 있다
- 오류 문구 6가지(틀림 · 구독 안 함 · 관리 불가 점포 · 비밀번호 미설정 · 잠김 · 네트워크)를 보인다. 잠금은 서버 판단으로 두고 화면은 문구만 보인다
- 로그인에 성공한 점포코드를 PC에 기억해 다음 로그인 화면 두 탭에 채운다. 탭을 바꿔도 입력 중이던 점포코드는 남는다
- 권한을 설정별(`canEditSetting`)로 바꿔 점포번호 계정도 프린터 설정을 바꿀 수 있다
- 로그인 요청에 PC 이름(Windows `COMPUTERNAME`)을 보낸다 (모의 서버)
- 로그의 계정 이름을 "웨일ERP 계정"으로 바꿨다

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t02-login-revision-f0`, 워크트리 `~/.whale-smart-pos-worktrees/T02-login-revision`, 브랜치 `feature/WHALEERPPO-3-login-revision`
- 접근: 기존 T02 구조(AuthApi 인터페이스 + 모의 구현, keyring 토큰 저장)를 유지하고 입력 · 오류 · 권한만 바꿨다. 코드 식별자 `master`는 그대로 두고 화면 글자만 바꿔 수정 범위를 줄였다. PC 이름 읽기와 [웨일ERP 열기]는 새 라이브러리 없이 Rust 명령 2개(`get_device_name`, `open_whale_erp`)로 만들었다. 여는 주소는 Rust 상수라 화면이 아무 주소나 열 수 없다
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review(②), pr-review-toolkit:review-pr(③). 구현은 Sonnet 5.5, ② · ③ 리뷰 서브에이전트는 Opus
- 시도했다 버린 방법: 탭마다 폼을 새로 만들어 점포코드를 기억값으로 다시 채우는 방식 → 입력 중이던 값이 사라져 화면 쪽(LoginScreen)으로 점포코드 상태를 올렸다 (사용자 A-2)

# 변경 파일
- 삭제: `src/features/login/FindStoreCodeDialog.tsx`, `src/features/login/digits.ts`(+테스트)
- 화면: `src/features/login/LoginForm.tsx` · `LoginScreen.tsx` · `login-texts.ts`(+ `LoginScreen.test.tsx`, 새 `LoginScreen.tauri.test.tsx`)
- 데이터: `src/shared/api/auth.ts`(+테스트): AuthApi에 비밀번호 · 점포코드 · deviceName, 오류 종류, `findStoreCode` 삭제, `Session.store.code`
- 세션: `src/shared/session/permissions.ts`(+테스트, `canEditSetting`), 새 `store-code.ts` · `last-store-code.ts`(+테스트), `restore-session.test.ts`, `token-store.ts`(주석)
- 플랫폼: 새 `src/shared/platform/system.ts`(+테스트), `src-tauri/src/system.rs`(새), `src-tauri/src/lib.rs`(명령 등록), `auto_login.rs`(주석)
- 로그: `src/shared/log/log-messages.ts`(+테스트): 실패 사유 4개, "웨일ERP 계정"
- 프로그램 틀: `src/features/app-shell/MainContent.tsx`(`canEditSetting(…, "printer")` 한 줄), `AppShellContext.tsx`(주석), `AppShell.test.tsx` · `AppShell.log.test.tsx`
- 테스트 설정: `src/test/setup.ts`(테스트마다 localStorage 비움)

# 검증
- pos-boss가 워크트리에서 직접 실행 (2026-11-18 10:41): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` 통과, `pnpm test` 20파일 187개 통과, `pnpm build` 통과, `cargo fmt --check` · `cargo clippy -- -D warnings` 통과, `cargo test` 29개 통과. `src/shared`에서 `features/`를 참조하는 줄 0
- ② (Opus): 1차 지적 8건 → 고침 6 · 보류 2(탭 전환 시 점포코드 → 사용자 결정 A-2로 해결, 점포코드 칸 중간 수정 시 커서 튐 가능 → Windows 확인). 재리뷰 지적 4건(Minor) → 고침 1 · 보류 3(스펙 3.2-4 문구 → 지휘 세션이 main에서 고침, 요청 중 탭 전환 시 두 번째 요청 · 늦은 실패 문구 → 기존 동작, 서버 세션 정책 협의 때 확인)
- ③ (Opus 4종: code-reviewer · pr-test-analyzer · silent-failure-hunter · comment-analyzer): 약 25건 → 대부분 고침 · 보류 5. 고친 것: 웨일ERP 탭 성공 시 점포코드 저장 테스트, localStorage에 비밀번호 · 아이디 없음 테스트, PC 이름 전달 · 로그 미노출 테스트, [웨일ERP 열기]가 주소 없이 명령만 부르는지 · 실패 시 화면 유지 테스트, PC 이름 읽기 실패 로그, [웨일ERP 열기] 터치 영역 확대, 낡은 "휴대폰 번호" 주석. 보류: [웨일ERP 열기] 실패 문구(사용자 B-1), 로그의 "마스터 계정"(사용자 C-2로 고침), Linux PC 이름 빈 값(배포 대상 아님), xdg-open 종료 코드 무시(T14와 같은 방식), 실제 API 때 오류 요약에 요청 주소 섞임 확인
- Windows 수동 확인 (사용자에게 요청):
  1. 점포코드 소문자 → 대문자, 비밀번호 눈 아이콘 · 20자 제한, 자동로그인 후 종료 · 재실행 시 로그인 화면 건너뜀, 로그아웃 후 다시 로그인 화면
  2. 웨일ERP 탭: 세 칸이 차야 [로그인] 활성, 자동로그인 체크 상자 없음
  3. [웨일ERP 열기]를 손가락으로 눌러 기본 브라우저가 뜨는지(임시 주소라 페이지는 안 열림), 탭을 오가도 점포코드가 남는지
  4. 로그인 성공 후 재실행하면 두 탭에 마지막 점포코드가 채워지는지
  5. 한글 입력기를 켠 채 점포코드 칸에서 커서가 튀는지, 터치로 누를 때 버튼 크기
  6. 점포번호 계정으로 프린터 추가가 되는지
  7. PC 이름이 읽히는지는 화면에 안 보여 이번엔 확인하지 않는다

# 결정 사항
- 기획자 답변의 "(제안)"도 확정으로 본다 (2026-11-18 사용자)[^answers]
- 점포코드는 자유 입력 + 대문자 변환, 탭 전환 시 입력값 유지, [웨일ERP 열기] 실패는 로그만, 로그 계정 이름 "웨일ERP 계정", 마지막 점포코드는 `localStorage`, PC 이름은 환경 변수, [웨일ERP 열기] 주소는 임시값 (2026-11-18 사용자)[^spec]

# 남은 일 / 위험
- [웨일ERP 열기] 실제 주소 미정 (`src-tauri/src/system.rs` 상수)
- 서버 오류 종류 · 잠금 판단 위치 · PC 이름 사용은 백엔드 협의 전 가정. `docs/requests/backend-api-request.md`의 로그인 설명(점포 고유번호 + 대표 휴대폰 번호)은 아직 옛 내용이다
- 프린터설정의 "마스터 계정만" 안내 문구는 소스에 남아 있다 (화면엔 안 뜸). T11 다시 열기에서 지운다
- 매장 프로그램 비밀번호 규칙(Q09 제안: 영문 · 숫자 6~20자)이 웨일ERP 비밀번호 규칙(spec-store PL-NNZV6U ACC-12: 3종 8자 · 2종 10자 이상)보다 약하다. 기획자 확인 필요 (설정은 웨일ERP 담당이라 이 앱 코드와 무관)
- 요청 중 탭 전환 시 두 번째 로그인 요청이 갈 수 있다 (기존 동작)

# 히스토리
- 2026-11-18T10:14+09:00 지시서 전달 (pos-boss → t02-login-revision-f0)
- 2026-11-18T10:14+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인, TDD로 시작
- 2026-11-18T10:25+09:00 작업 세션 보고: 구현 · ① 통과, ② Opus 지적 8건 → 고침 6 · 보류 2, ③ Opus 4종 지적 약 25건 → 대부분 고침 · 보류 5. 질문 3개(탭 전환 시 점포코드, [웨일ERP 열기] 실패 문구, 로그의 "마스터 계정")
- 2026-11-18T10:25+09:00 pos-boss 직접 확인: lint · typecheck · format 통과, test 20파일 186개 통과, build 통과, cargo fmt · clippy 통과, cargo test 29개 통과
- 2026-11-18T10:38+09:00 사용자 답: A-2(탭 전환 시 입력 중 점포코드 유지), B-1([웨일ERP 열기] 실패는 로그만), C-2(로그 문장 "웨일ERP 계정"). pos-boss 추가 지시: normalizeStoreCode를 shared로 옮김(shared → features 참조 제거)
- 2026-11-18T10:41+09:00 작업 세션 보고: A-2 · C-2 · 구조 정리 반영, ① 통과, ② 재리뷰(Opus) 지적 4건 → 고침 1 · 보류 3. pos-boss 직접 확인: ① 전부 통과(test 187개, cargo test 29개). 스펙 3.2-4 문구는 pos-boss가 main에서 고침
- 2026-11-18T10:52+09:00 사용자 "커밋해" → 커밋 `723755a`(코드) · `8549004`(OKF), main에 스펙 `97f62a7` · 백엔드 문서 `ea046d6`
- 2026-11-18T10:55+09:00 사용자 "머지해" → `93614c9`, main에서 test 187개 통과
- 2026-11-18T10:59+09:00 사용자 OKF 승인 (status: stable)

[^spec]: SPEC-login.md 13장
[^answers]: planner-answers.md 머리말
