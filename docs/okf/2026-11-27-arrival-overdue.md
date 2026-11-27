---
type: Task Report
title: T19 후속 도착 표시 정리
description: 도착 예정 문구의 「N분 뒤 · 지남」을 화면에 보이는 분 기준으로 세고, 60분 이상 지나면 「1시간 이상 지남」으로 줄인다.
tags: [order-board]
status: stable
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
verified:
  - by: human:yjnoh
    at: 2026-11-27T14:30:00+09:00
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
- 「3분 뒤 자동 취소」 경고는 분 단위 갱신을 쓰지 않고 경고 시각(`autoCancelAt − 3분`, 초 단위)에 맞춰 띄운다(⑤ 블로커). 타이머를 이어 걸어 시계 변경 · 절전 뒤에도 경고 시각에 뜬다(⑤ 재실행 블로커).

# 작업 방법
- 진행: 지휘 세션 pos-boss, 작업 세션 `t19-arrival-overdue-98`(Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T19-arrival-overdue`, 브랜치 `fix/WHALEERPPO-52-arrival-overdue`. ② `t19-arrival-overdue-2e` · ③ `t19-arrival-overdue-fe`(각각 새 Opus 5.5 세션)
- 접근: 현재 시각과 도착 시각을 모두 분으로 내린 뒤 정수 차이 하나로 「N분 뒤 · 괄호 없음 · N분 지남 · 1시간 이상 지남」을 가른다. 올림 · 내림을 섞던 옛 방식의 초 어긋남이 없어진다. `useNow`는 setTimeout을 매번 다음 경계로 다시 건다.
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review(②), pr-review-toolkit:review-pr(③), agent-browser(화면 확인)
- 시도했다 버린 방법: 첫 갱신만 경계에 맞추고 setInterval(② 직후 구현) → 절전 · 시계 변경 뒤 박자가 어긋난 채 남아서 ③ 지적으로 바꿈

# 변경 파일
- `src/features/order-board/order-board-logic.ts`: `arrivalSchedule` 분 기준 계산, `OVERDUE_CAP_MIN = 60`
- `src/features/order-board/order-board-logic.test.ts`: 경계 사례 6개(초가 붙은 도착 전후 · 59 · 60 · 710분 · 90분 뒤)
- `src/features/order-board/use-now.ts`: 간격 경계에 맞춘 setTimeout 이어 걸기, effect 시작에서 경계를 넘었으면 한 번 보정(⑤ 참고 1, 이유를 단 eslint-disable 한 줄)
- `src/features/order-board/use-now.test.ts`(새 파일): 15:47:30에 켜면 15:48:00 갱신, +37초 어긋난 뒤 다시 0초, 그린 뒤 effect 전 경계 넘김 보정, 언마운트 시 타이머 0개
- `src/features/order-board/OrderBoardScreen.test.tsx`: 시작 시각을 15:25:30으로 고정하고 경고가 정확히 15:37:30에 뜨는지(1초 전 없음) 확인, 「타이머가 일찍 울려도 경고 시각에 뜬다」 추가
- `src/features/order-board/OrderCard.tsx`: `AutoCancelWarning`이 경고 시각까지 타이머를 이어 걸어(최대 1분 대기) 다시 그림. 시계가 뒤로 가거나 일찍 울려도 경고 시각에 뜬다
- `docs/specs/SPEC-order-board.md` 12장: 「60분 이상 지남」 표 줄, 분 기준 · 1시간 이상 지남 규칙
- `docs/test-scenarios/T19-arrival-time.md`: 분 경계 설명, A4 문구, A5 · A6 추가

# 검증
- 작업 세션 ①(⑤ 블로커 수정 뒤): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm build` 통과, `pnpm test` 62파일 862개 통과 · 5개 건너뜀(기존). Rust는 안 건드려 생략
- pos-boss 재실행: `pnpm lint` 통과, order-board · desktop-widget · order-history · order-summary 13파일 272개 통과
- 브라우저(`pnpm dev`, agent-browser): 13:24:38에 「13:29 도착 (5분 뒤)」 · 「13:34 도착 (10분 뒤)」 → 13:25:04에 「4분 뒤」 · 「9분 뒤」로 분 경계에서 바뀜 (시나리오 A6)
- 「1분 지남」 · 「1시간 이상 지남」은 실제로 기다려야 보여서 가짜 시계 테스트로 확인 (시나리오 A4 · A5)
- ② Critical 0 · Important 0 · Minor 3, ③ 중요 1 · 사소 2, ④ 0건, ⑤ 블로커 1 · 참고 3, ⑤ 재실행 블로커 1, ⑤ 3차 블로커 0 (히스토리 참고)

# 결정 사항
- 분 기준 계산 (A-1), 60분 이상은 「1시간 이상 지남」 (B-1): 2026-11-27 사용자 결정[^spec]

# 남은 일 / 위험
- 실제 Windows(WebView2)에서 절전 뒤 타이머가 언제 울리는지는 확인하지 못했다. Windows 체크리스트에서 절전 복귀 뒤 카드 시각 · 자동 취소 경고가 맞는지 본다.
- 모의 서버는 `autoCancelAt`이 되어도 스스로 취소하지 않는다(경고만 보인다). 자동 취소 자체는 서버 일이라 T17에서 확인한다 (2026-11-27 사용자 결정 A-1).
- `arrivalAt` · `autoCancelAt`이 비거나 NaN이면 「NaN분 지남」이 보일 수 있다. 실제 API 응답 경계에서 T17이 검사한다 (⑤ 참고 3).
- 위젯 되돌리기 카운트다운(`useNow(1000)`)은 매초 0ms에 맞춰져 첫 간격이 1초보다 짧을 수 있다. 1초 안쪽 차이라 그대로 둔다 (⑤ 참고 2).
- `useNow`는 공용 훅이라 위젯 되돌리기 카운트다운(`WidgetScreen.tsx` `useNow(1000)`) · 주문내역(`OrderHistoryScreen.tsx`)도 간격 경계(매초 0ms · 매분 0초)에 맞춰 갱신된다. 숫자는 1초 · 1분 안에서만 달라져 동작 문제는 없다 (③ 지적 3).
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
- 2026-11-27T15:40+09:00 사용자 "커밋해" → 커밋 4개 푸시. 명령 실수로 제목 줄이 빠져 사용자 결정(A-1)으로 같은 트리에 제목을 붙여 다시 만들고 이 작업 브랜치만 `--force-with-lease`로 덮어씀 (`ab7a78d` · `9118f3e` · `7e5ccf8` · `f8d2f16`)
- 2026-11-27T15:45+09:00 PR #2 만듦, ④ 리뷰 세션(Opus 5.5) 열고 지시서 전달
- 2026-11-27T16:00+09:00 ④ 리뷰(Opus 5.5, code-review:code-review): 지적 0건. 참고로 받은 시나리오 표 순서(A4 · A6 · A5)는 pos-boss가 A5 · A6 순으로 고침. ④ 세션 닫음, ⑤ 리뷰 세션 열고 지시서 전달
- 2026-11-27T16:20+09:00 ⑤ 최종 게이트(Opus 5.5, ip-code-review-claude, PR 댓글): 블로커 1 — 분 경계 갱신 때문에 자동 취소 경고가 최대 59초 늦게 뜸(이번 변경의 회귀, ② 때 「예전과 같음」 보고는 틀렸음) · 참고 3(렌더-effect 틈, 위젯 카운트다운 간격, arrivalAt NaN). ⑤ 세션 닫음
- 2026-11-27T16:25+09:00 사용자 A-1(코드 동결 예외): 경고는 경고 시각 단발 타이머로, useNow는 effect 시작에서 한 번 갱신 → 작업 세션에 지시. 위젯 카운트다운은 그대로, NaN은 T17
- 2026-11-27T16:45+09:00 작업 세션 ⑤ 블로커 고침: AutoCancelWarning 단발 타이머, useNow effect 시작 보정, 테스트 2개 수정 · 추가, ① 통과 861. pos-boss가 diff 확인 · lint · 관련 테스트 271개 재실행 통과
- 2026-11-27T17:00+09:00 사용자 규칙 추가(PR에 작업 내용 · 해결 방안 댓글, 블로커면 그 단계 재리뷰) → PR #2에 작업 내용 · 지적 해결 표 댓글, ⑤ 재실행(Opus 5.5)
- 2026-11-27T17:15+09:00 ⑤ 재실행: 앞 블로커는 정상 조건에서 풀림. 새 블로커 1 — AutoCancelWarning 타이머가 한 번만 걸려 시계가 뒤로 가거나 일찍 울리면 경고가 안 뜸(useNow 매분 확인을 뺀 회귀). 작업 세션에 이어 걸기(최대 60초 대기)로 고치게 함. ⑤ 세션 닫음
- 2026-11-27T17:35+09:00 작업 세션 ⑤ 재실행 블로커 고침: AutoCancelWarning 이어 걸기(최대 1분), 「일찍 울림」 테스트 추가, ① 통과 862. pos-boss가 diff 확인 · lint · 관련 테스트 272개 재실행 통과
- 2026-11-27T17:45+09:00 사용자 "커밋해"(응) → `4ccc759` · `9efe61b` 푸시, PR #2에 해결 댓글, ⑤ 3차 실행
- 2026-11-27T18:00+09:00 ⑤ 3차(Opus 5.5): 블로커 0. 참고 1(arrivalAt NaN, T17). ⑤ 세션 닫음
- 2026-11-27T14:14+09:00 사용자 "머지해" → 로컬 `--no-ff` 머지 `f0b5dc7`, `main` 푸시, PR #2 Merged
- 2026-11-27T14:30+09:00 사용자 실제 창 확인(3분 경고 · 분 경계 갱신 정상), 모의 서버 자동 취소는 그대로(A-1), OKF 승인(B-1)

[^spec]: SPEC-order-board 12장
