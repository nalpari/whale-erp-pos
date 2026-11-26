---
type: Task Report
title: T13 AI챗봇 인기메뉴 설정 탭 숨김
description: 픽업오더 앱이 AI 주문(챗봇)을 1차 범위에서 빼서, 환경설정의 「AI챗봇 인기메뉴 설정」 탭을 숨긴다.
tags: [settings-ai-popular, app-shell, scope]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-26T14:30:00+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-settings-ai-popular.md
    title: 맨 위 「1차 범위에서 뺌」
  - id: task
    resource: plane:WHALEERPPO-14
    title: T13 환경설정 — AI챗봇 인기메뉴 설정
---

# 목표
- 환경설정에서 「AI챗봇 인기메뉴 설정」 탭이 보이지 않는다. 위젯설정 · 프린터설정은 그대로다.
- 인기메뉴 코드(`src/features/settings-ai-popular/`, `src/shared/api/popular*.ts`)는 지우지 않는다. 다음 차수에 탭만 되살리면 된다.
- 메뉴품절(같은 상품 추가 팝업을 씀)은 그대로 동작한다.

# 작업 내용
- 환경설정 하위 탭이 [위젯설정] · [프린터설정] 2개가 됐다. 두 계정 모두 같다.
- 인기메뉴 화면 · API · 모의 서버 코드는 그대로 남겼다. 다음 차수에 `tabs.ts`의 주석 줄을 풀고 `AiPopularTab.test.tsx`의 skip을 떼면 돌아온다.
- 메뉴품절(같은 추가 팝업을 씀)은 바뀌지 않았다.

# 작업 방법
- 진행: 지휘 세션 pos-boss / 작업 세션(Orca가 정함), 워크트리 `~/.whale-smart-pos-worktrees/T13-hide-ai-popular` · 브랜치 `feature/WHALEERPPO-14-hide-ai-popular`

# 변경 파일
- `src/features/app-shell/tabs.ts`: `SETTINGS_TABS`에서 인기메뉴 항목을 주석 줄로 돌림. 숨긴 탭의 분기(MainContent)가 컴파일되게 `SettingsTabId`를 세 값 합집합으로 직접 적음
- `src/features/app-shell/AppShell.test.tsx`: 하위 탭이 2개이고 인기메뉴 탭이 없는지 확인
- `src/features/settings-ai-popular/AiPopularTab.test.tsx`: `describe.skip` + 되살리는 방법 주석 (5개 모두 AppShell 탭 연결을 보는 테스트라 화면만 렌더해서는 못 살림. 권한 2개는 `AiPopularScreen.test.tsx`에 같은 테스트가 있다)
- `AGENTS.md`, `docs/specs/SPEC-settings-ai-popular.md`, `docs/specs/README.md`: 「1차 범위에서 뺌」 표시
- `docs/test-scenarios/T13-settings-ai-popular.md`: 「H. 탭 숨김」 묶음 추가, A~C는 되살릴 때용으로 표시

# 검증
- 작업 세션 ①: lint · typecheck · format:check · build, Rust 검사 3종(cargo test 53개) 모두 통과
- 지휘 세션이 다시 돌림: `pnpm typecheck` · `pnpm lint` 통과, `pnpm test` 파일 60 통과 · 1 skip, 테스트 841 통과 · 5 skip(AiPopularTab 5개)
- 리뷰 (Opus 5.5 서브에이전트): ② 지적 2건 → 고침 1(쓸모없는 `as const` 제거) · 보류 1(`SETTINGS_TABS[0]` 타입 보장 약해짐: `satisfies`로 바꾸면 id 타입이 다시 좁아져 타입 검사가 깨짐, 탭 2개라 실제 위험 없음). ③ code-reviewer · pr-test-analyzer · comment-analyzer 지적 3건 → 고침 2(skip 주석에 AppShell.test 되돌리기 안내, tabs.ts에 지운 줄 남김) · 보류 1(테스트 주석이 제목과 겹침, 낮음)
- 실제 창: `docs/test-scenarios/T13-settings-ai-popular.md` 「H. 탭 숨김」. 2026-11-26 사용자가 Linux 실제 창에서 H1(하위 탭 2개) 확인

# 결정 사항
- 탭을 숨기고 코드는 남긴다: 재영 결정(2026-11-26, 버즈)으로 고객 앱의 AI 주문이 1차 범위에서 빠졌다. 앱에 챗봇이 없으면 인기메뉴를 보여 줄 곳이 없다. 사용자가 「서비스 준비중」 안내 · 코드 삭제 대신 숨김을 골랐다(A-1)[^spec]

# 남은 일 / 위험
- skip한 테스트는 돌지 않아서, 그동안 화면 문구가 바뀌어도 되살릴 때까지 모른다.
- 명세 보관소 DC-SPAIPM은 머지 뒤 스펙 사본을 다시 만들 때 고친다.
- 다음 차수에 AI 주문을 다시 넣으면 탭을 되살리고 SPEC-settings-ai-popular의 「뺌」 표시를 지운다.

# 히스토리
- 2026-11-26T14:20+09:00 버즈 알림(재영 결정: 픽업오더 앱 AI 주문 1차 범위 제외, POS 짝 기능도 빼 달라) → 사용자 결정 A-1(탭 숨김) · B-1(명세 보관소 · 저장소 문서에 「1차 범위에서 뺌」 표시)
- 2026-11-26T14:30+09:00 워크트리 · 브랜치 만듦, 지시서 전달 (pos-boss → 작업 세션 `t13-hide-ai-popular-de`, 모델 Sonnet 5.5 회신)
- 2026-11-26T14:45+09:00 저장소 문서에 「1차 범위에서 뺌」 표시: AGENTS.md 범위 · 확정 사항, SPEC-settings-ai-popular 상태, specs README, T13 시나리오
- 2026-11-26T14:52+09:00 명세 보관소 F-AIPOPM · S-AIPICK · R-STRINF · PRD · UF-PSTORE에 「1차 범위에서 뺌」 표시 승인 반영. DC-SPAIPM은 머지 뒤 스펙 사본을 다시 만들 때 같이 고친다
- 2026-11-26T15:20+09:00 작업 세션 보고: 완료 기준 4개 됨, AiPopularTab 테스트 skip 처리 확인 요청 → 지휘 세션이 diff 확인 · typecheck · lint · test 다시 돌림

[^spec]: SPEC-settings-ai-popular 맨 위 「1차 범위에서 뺌」
