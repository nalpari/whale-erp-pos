---
type: Task Report
title: T13. 환경설정 — AI챗봇 인기메뉴 설정
description: 고객 앱 AI 챗봇의 인기 메뉴에 나올 메뉴를 최대 5개 고르고 바로 저장한다.
tags: [settings-ai-popular, react]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-19T15:06:31+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-settings-ai-popular.md
    title: 스펙 — 환경설정 AI챗봇 인기메뉴 설정 (2026-11-19 승인, 11장 C · D 구현 중 결정)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q10 · Q42 · Q43 · Q48
  - id: task
    resource: plane:WHALEERPPO-14
    title: "[F-AIPOPM] T13. 환경설정 — AI챗봇 인기메뉴 설정"
---

# 목표
환경설정 [AI챗봇 인기메뉴 설정] 탭에서 고객 앱 AI 챗봇의 [인기 메뉴]에 나올 메뉴를 최대 5개 고른다. 완료 기준은 스펙 10장 1~7[^spec].

# 작업 내용
- [AI챗봇 인기메뉴 설정] 하위 탭이 자리표시 대신 실제 화면이 됐다
- 안내 문구, 「N / 5개」, 목록(상품명 · 카테고리 · 금액 · 일시품절 / 숨김 꼬리표 · [삭제], 먼저 추가한 것이 위), 5개면 [+ 인기상품 추가] 막힘
- [삭제]: 확인창 「인기메뉴에서 삭제하시겠습니까?」 → 바로 삭제. 추가 · 삭제 모두 바로 저장, [저장] 버튼 없음
- 추가 팝업: T09 품절상품 추가 팝업을 같이 쓴다. [옵션] 탭 없음, 숨김 메뉴는 회색 · 체크 막힘, 일시품절 메뉴는 고를 수 있음, 이미 인기메뉴인 것은 「등록됨」, 남은 자리만큼 고르면 나머지 막힘 + 「N개 선택됨 (최대 M개 더)」, [추가하기] 바로 저장 · 팝업 유지, 일부만 추가되면 「M개는 추가하지 못했습니다.」
- 웨일ERP 계정만 바꾼다. 점포번호 계정은 목록만 보이고 버튼이 없으며 위에 「AI챗봇 인기메뉴는 웨일ERP 계정으로 로그인해야 바꿀 수 있습니다.」
- 하위 탭을 누를 때마다 다시 조회(메뉴품절에서 바꾼 품절 상태가 꼬리표에 반영), 요청 중에는 메인 탭 · 하위 탭 이동을 막음

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t13-settings-ai-popular-2a`(Orca로 실행, Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T13-settings-ai-popular`, 브랜치 `feature/WHALEERPPO-14-settings-ai-popular`
- 접근: T09 `AddPopup`을 복사하지 않고 상품 목록 읽기 · 추가 · 등록됨 판단 · 문구 · 고를 수 있는지 · 꼬리표 · 한도 · 로그를 밖에서 받게 바꿔 두 화면이 같이 쓴다. T09 테스트 파일은 고치지 않았고 모두 통과한다. 인기메뉴 모의 서버는 T09 모의 서버의 상품 · 품절 데이터를 읽는다. 새 라이브러리 없음
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review, pr-review-toolkit:review-pr (리뷰 서브에이전트는 모두 Opus 5.5)

# 변경 파일
- `src/features/settings-ai-popular/`: 화면(`AiPopularScreen`) · 순수 함수(`popular-logic`) · 문구 · 로그 · 테스트
- `src/shared/api/popular.ts` · `popular-context.ts` · `popular.test.ts`: 인기메뉴 API · 모의 구현(예시 2개) · Context
- `src/features/soldout/AddPopup.tsx` · `SoldOutScreen.tsx` · `soldout-texts.ts`: 팝업 공용화와 연결
- `src/shared/api/soldout.ts`: 상품 항목에 선택 칸 `soldOutMode`
- `src/features/app-shell/MainContent.tsx`: 하위 탭 연결 · 다시 조회 · 이동 막기
- `src/app/App.tsx`: 모의 API 연결. `src/shared/log/log-messages.ts`: 인기메뉴 로그 3종. `src/shared/session/permissions.ts`: 주석

# 검증
- 지휘 세션이 워크트리에서 직접 실행 (최종 A-2 반영 뒤): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm test`(55파일 737개) · `pnpm build` 통과. 첫 보고 뒤 `cargo fmt --check` · `cargo clippy -q -- -D warnings` · `cargo test`(35개) 통과(Rust 변경 없음). T09 테스트 파일 변경 없음 확인
- ② 리뷰(Opus 5.5): 8건 → 고침 6(삭제 중 추가 버튼 잠금, 불러오기 화면에 갇히고 토스트가 안 보이던 문제, 「최대 -1개 더」 막기 · 한도 초과 제출 막기, 숨김 줄 회색, 로그 정리, 주석) · 보류 2(일부 추가 문구 → 사용자 결정 A-2로 반영, 공용 타입의 soldOutMode — 낮음)
- ③ 리뷰(Opus 5.5, code-reviewer · pr-test-analyzer · silent-failure-hunter): code 0건, 테스트 8건 → 보강 6 · 보류 2, 오류 처리 4건 → 고침 2(요청 중 같은 탭 재누름 무시, 한도가 줄었을 때 안내) · 보류 2(아래 남은 일)
- Linux 실제 창 (사용자, 머지 뒤): 미확인
- Windows 수동 체크리스트 (사용자, 미확인):
  1. 두 계정으로 실제 창 확인 순서를 설치 파일에서 반복
  2. 터치로 체크박스 · [추가하기] · [삭제] · 확인창이 잘 눌리는지
  3. 요청 중 메인 탭 · 하위 탭이 눌리지 않는지
  4. 로그 확인 화면에 인기메뉴 로그가 상품 코드 · 건수만 있는지

# 결정 사항
- 승인 때 (2026-11-19 사용자, 모두 권장안): 점포번호 계정은 목록만 + 안내 줄, 목록 위 「N / 5개」[^spec]
- C. 일부만 추가됐을 때 「M개는 추가하지 못했습니다.」(이유를 말하지 않음) (사용자)[^spec]
- D. 요청 중 같은 하위 탭을 다시 누르면 다시 조회하지 않음 (사용자)[^spec]

# 남은 일 / 위험
- 기획자 추가 문의 Q56(점포번호 계정 화면) 답변 대기. 답이 다르면 안내 줄 · 버튼 처리만 고친다
- 위젯으로 이동해 화면이 내려가면 결과 토스트를 못 본다(T09와 같은 설계)
- 시간 초과 때 「저장하지 못했습니다」가 실제(늦게 저장됨)와 다를 수 있다(T09와 같은 패턴, 다시 조회로 맞춰짐)
- 모의 서버라 앱을 다시 켜면 처음 값으로 돌아간다

# 히스토리
- 2026-11-19T15:06+09:00 스펙 승인 · 커밋 `245be8a`, 지휘 세션이 Orca로 작업 세션을 Sonnet 5.5로 열고 지시서 전달
- 2026-11-19T15:07+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인, 시작
- 2026-11-19T15:18+09:00 작업 세션 보고: 구현 · ① · ② 8건(고침 6) · ③(보강 6 · 고침 2), 질문 A · B → 지휘 세션 ① 직접 재실행 통과(737개 · Rust 35개)
- 2026-11-19T15:20+09:00 사용자 답: A-2(중립 문구), B-1(재누름 무시 확정) → 작업 세션 반영, 지휘 세션 ① 재확인(737개)
- 2026-11-19T15:24+09:00 스펙 결정 C · D main 커밋 `6324779`, 사용자 "a-1,b-1" → 커밋 · 머지

[^spec]: SPEC-settings-ai-popular.md
