---
type: Task Report
title: T19 후속 도착 표시 정리
description: 도착 예정 문구의 「N분 뒤 · 지남」을 화면에 보이는 분 기준으로 세고, 60분 이상 지나면 「1시간 이상 지남」으로 줄인다.
tags: [order-board]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-27T14:00:00+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-order-board.md
    title: 12장 개정 — 도착 예정 시각 (분 기준 · 1시간 이상 지남)
  - id: task
    resource: plane:WHALEERPPO-52
    title: T19 도착 예정 시각
---

# 목표
- A-1: 「N분 뒤 · N분 지남」을 보이는 「HH:mm」(초를 버린 분) 기준으로 센다. 도착 15:47:30이면 15:48:00부터 「(1분 지남)」.
- B-1: 60분 이상 지나면 「(1시간 이상 지남)」.
- 카드 · 요약 팝업 · 위젯 · 주문내역이 같은 문구를 보인다. 주문서 · 영수증은 바뀌지 않는다.

# 작업 내용
- 도착 예정 문구의 「N분 뒤 · N분 지남」을 화면에 보이는 「HH:mm」 기준으로 센다. 도착 15:47:30이면 15:47 동안 괄호가 없고 15:48:00부터 「(1분 지남)」(A-1).
- 60분 이상 지나면 「(1시간 이상 지남)」(빨강). 어제 주문이 남아도 「710분 지남」이 보이지 않는다(B-1).
- 카드 · 요약 팝업 · 위젯 · 주문내역이 같은 함수라 함께 바뀐다. 주문서 · 영수증의 「도착예정: HH:mm」은 그대로.
- 카드 시각 갱신을 켠 시각 기준 60초마다에서 매분 0초로 바꿨다. 절전 · 시계 변경 뒤에도 다음 번에 다시 맞춘다(② · ③ 지적).

# 작업 방법
- 진행: 지휘 세션 pos-boss, 작업 세션 `t19-arrival-overdue-98`(Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T19-arrival-overdue`, 브랜치 `fix/WHALEERPPO-52-arrival-overdue`. ② `t19-arrival-overdue-2e` · ③ `t19-arrival-overdue-fe`(각각 새 Opus 5.5 세션)
- 접근: 현재 시각과 도착 시각을 모두 분으로 내린 뒤 정수 차이 하나로 「N분 뒤 · 괄호 없음 · N분 지남 · 1시간 이상 지남」을 가른다. 올림 · 내림을 섞던 옛 방식의 초 어긋남이 없어진다. `useNow`는 setTimeout을 매번 다음 경계로 다시 건다.
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review(②), pr-review-toolkit:review-pr(③), agent-browser(화면 확인)
- 시도했다 버린 방법: 첫 갱신만 경계에 맞추고 setInterval(② 직후 구현) → 절전 · 시계 변경 뒤 박자가 어긋난 채 남아서 ③ 지적으로 바꿈

# 변경 파일
- `src/features/order-board/order-board-logic.ts`: `arrivalSchedule` 분 기준 계산, `OVERDUE_CAP_MIN = 60`
- `src/features/order-board/order-board-logic.test.ts`: 경계 사례 6개(초가 붙은 도착 전후 · 59 · 60 · 710분 · 90분 뒤)
- `src/features/order-board/use-now.ts`: 간격 경계에 맞춘 setTimeout 이어 걸기
- `src/features/order-board/use-now.test.ts`(새 파일): 15:47:30에 켜면 15:48:00 갱신, +37초 어긋난 뒤 다시 0초, 언마운트 시 타이머 0개
- `src/features/order-board/OrderBoardScreen.test.tsx`: 시작 시각을 정각으로 고정하는 한 줄(갱신이 매분 0초라서)
- `docs/specs/SPEC-order-board.md` 12장: 「60분 이상 지남」 표 줄, 분 기준 · 1시간 이상 지남 규칙
- `docs/test-scenarios/T19-arrival-time.md`: 분 경계 설명, A4 문구, A5 · A6 추가

# 검증
- 작업 세션 ①: `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm build` 통과, `pnpm test` 62파일 860개 통과 · 5개 건너뜀(기존). Rust는 안 건드려 생략
- pos-boss 재실행: order-board · desktop-widget · order-history · order-summary 13파일 270개 통과
- 브라우저(`pnpm dev`, agent-browser): 13:24:38에 「13:29 도착 (5분 뒤)」 · 「13:34 도착 (10분 뒤)」 → 13:25:04에 「4분 뒤」 · 「9분 뒤」로 분 경계에서 바뀜 (시나리오 A6)
- 「1분 지남」 · 「1시간 이상 지남」은 실제로 기다려야 보여서 가짜 시계 테스트로 확인 (시나리오 A4 · A5)
- ② Critical 0 · Important 0 · Minor 3, ③ 중요 1 · 사소 2 (히스토리 참고)

# 결정 사항
- 분 기준 계산 (A-1), 60분 이상은 「1시간 이상 지남」 (B-1): 2026-11-27 사용자 결정[^spec]

# 남은 일 / 위험
- `useNow`는 공용 훅이라 위젯 되돌리기 카운트다운(`WidgetScreen.tsx` `useNow(1000)`) · 주문내역(`OrderHistoryScreen.tsx`)도 간격 경계(매초 0ms · 매분 0초)에 맞춰 갱신된다. 숫자는 1초 · 1분 안에서만 달라져 동작 문제는 없다 (③ 지적 3).
- 자동 취소 경고는 분을 버리지 않고 `autoCancelAt`과 비교하므로 경고 시각 뒤 첫 매분 0초에 뜬다(최대 59초 늦음, 예전과 같은 크기).
- 도착 시각이 다음 날로 넘어가도 HH:mm만 보인다 (T19 보고서에서 이어짐).

# 히스토리
- 2026-11-27T14:00+09:00 T19 메모 2건 결정 A-1 · B-1, 계획 승인, 워크트리 · 브랜치 만듦, 스펙 12장 보강 (pos-boss)
- 2026-11-27T14:05+09:00 지시서 전달 (pos-boss → 작업 세션 `t19-arrival-overdue-98`), 모델 Sonnet 5.5 회신
- 2026-11-27T14:25+09:00 작업 세션 끝 보고: arrivalSchedule 분 기준 · 60분 상한, 테스트 6개 추가, ① 통과(857 통과). pos-boss가 diff 확인 · order-board 테스트 56개 재실행 통과
- 2026-11-27T14:27+09:00 ② 리뷰 세션(Opus 5.5) 열고 지시서 전달
- 2026-11-27T14:40+09:00 ② 리뷰(Opus 5.5): Critical 0 · Important 0 · Minor 3 → 1 시나리오 옛 분 기준 문구: pos-boss가 고침(A4 문구, A5 추가) · 2 use-now 1분 타이머가 분 경계와 안 맞음(기존 코드): 사용자 결정 대기 · 3 그대로(위젯 · 보드 테스트가 빨간 글자 경로 확인). ② 세션 닫음
- 2026-11-27T14:45+09:00 사용자 A-1: use-now 갱신을 분 경계에 맞춤 → 작업 세션 고침(use-now.test.ts 새로, OrderBoardScreen.test 시작 시각 고정), ① 통과 859. pos-boss가 diff 확인 · 관련 테스트 213개 재실행 통과
- 2026-11-27T15:00+09:00 ③ 리뷰 세션(Opus 5.5) 열고 지시서 전달
- 2026-11-27T15:15+09:00 ③ 리뷰(Opus 5.5): 중요 1 · 사소 2 → 1 use-now가 첫 경계만 맞추고 setInterval이라 절전 · 시계 변경 뒤 어긋난 채 남음: 작업 세션에 setTimeout 이어 걸기로 고치게 함 · 2 시나리오 옛 갱신 설명: pos-boss가 고침 · 3 useNow 공용 영향(위젯 카운트다운 · 주문내역): 남은 일에 적음. ③ 세션 닫음
- 2026-11-27T15:25+09:00 작업 세션 ③ 지적 고침: use-now를 setTimeout 이어 걸기로(매번 경계 다시 잼), 테스트 1개 추가, ① 통과 860. pos-boss가 코드 확인 · 관련 테스트 270개 재실행 통과, 브라우저로 분 경계에서 「5분 뒤 → 4분 뒤」 바뀜 확인(시나리오 A6)

[^spec]: SPEC-order-board 12장
