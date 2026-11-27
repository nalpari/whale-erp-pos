---
type: Task Report
title: T19 도착 예정 시각
description: 고객이 고른 픽업 예정 선택지 대신 서버가 주는 도착 예정 시각을 카드 · 요약 · 위젯 · 주문내역 · 주문서 · 영수증에 보인다.
tags: [order-board, order-summary, desktop-widget, order-history, print-forms]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-27T11:00:00+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-order-board.md
    title: 12장 개정 — 도착 예정 시각
  - id: print
    resource: /docs/specs/SPEC-print-forms.md
    title: 12장 도착예정 줄
  - id: task
    resource: plane:WHALEERPPO-52
    title: T19 도착 예정 시각
---

# 목표
- 주문 데이터의 `pickupChoice`를 없애고 서버가 주는 `arrivalAt`(필수)으로 바꾼다.
- 카드: 도착 전 「15:45 도착 (20분 뒤)」, 지나면 괄호 안 빨간 「3분 지남」. 요약 · 위젯 · 주문내역도 같은 문구.
- 주문서 「도착예정: HH:mm」, 영수증 · 취소 영수증 1번 줄 끝에 「도착예정: HH:mm」.

# 작업 내용
- 주문 데이터의 `pickupChoice`(지금 · N분 · 1시간 이상)를 없애고 서버가 주는 `arrivalAt`으로 바꿨다.
- 카드 · 요약 팝업 · 위젯이 「HH:mm 도착 (N분 뒤)」를 보이고, 도착 시각이 1분 넘게 지나면 괄호 안이 빨간 「N분 지남」이 된다. 주문내역 상세는 괄호 없이 「HH:mm 도착」. 항목 이름은 「도착 예정」.
- 주문서는 「도착예정: HH:mm」, 영수증 · 취소 영수증은 주문번호 다음 줄에 「도착예정: HH:mm」을 찍는다.

# 작업 방법
- 진행: 지휘 세션 pos-boss / 작업 세션(Orca가 정함), 워크트리 `~/.whale-smart-pos-worktrees/T19-arrival-time` · 브랜치 `feature/WHALEERPPO-52-arrival-time`
- 새 흐름(2026-11-27): 커밋 뒤 공개 사본에 PR, PR 봇 리뷰(④) 뒤 로컬 머지

# 변경 파일
- `src/shared/api/orders.ts` · `order-history.ts`: `pickupChoice` · `PickupChoice` · `PICKUP_CHOICE_MINUTES` 삭제, `arrivalAt`(필수). 모의 주문은 도착 최소 시간 + 5×k분(k=0~6)
- `src/features/order-board/order-board-logic.ts` · `OrderCard.tsx` · `board-texts.ts`: `arrivalClock` · `arrivalSchedule`
- `src/features/order-summary/` · `order-history/` · `desktop-widget/`: 같은 함수, 항목 이름 「도착 예정」, 위젯 메시지에 `arrivalAt`
- `src/features/print-forms/order-form.ts` · `receipt-form.ts` · `print-texts.ts`: 「도착예정」 줄
- 테스트 13개 파일
- `docs/test-scenarios/T19-arrival-time.md` (새)

# 검증
- 작업 세션 ①: lint · typecheck · format:check · build, Rust 3종(cargo test 53개) 통과, `pnpm test` 2번 연속 851 통과 · 5 skip
- 지휘 세션이 다시 돌림: typecheck · lint · format:check 통과, `pnpm test` 2번 연속 851 통과 · 5 skip. `grep pickupChoice src` 0건
- 리뷰 (Opus 5.5): ② 지적 3(Minor) → 고침 0 · 보류 3(주석 정리 · 동작 문제 없음). ③ 4개 에이전트 지적 10 → 고침 9 · 보류 1(모의 서버 최소 시간 변경 테스트, 4점)
- 실제 창: 지휘 세션이 agent-browser로 브라우저(`pnpm dev`)에서 A1~A3(카드 · 요약 팝업 · 주문내역 문구) 통과 확인. Tauri 창은 agent-desktop이 WebKitGTK 화면 안쪽을 읽지 못해(접근성 트리에 내용이 안 나옴) 자동 확인하지 못했다. 위젯 · 출력(B)은 사용자 결정으로 자동 테스트로 대신, 실물은 Windows 체크 때

# 결정 사항
- 분 경계는 T04 규칙 그대로(남은 분 올림, 정각부터 1분 미만 괄호 없음, 지남 내림): 사용자 A-1(2026-11-27)[^spec]
- `arrivalAt`은 필수 값으로 두고 빈 값 처리는 T17에서 한다: 서버도 같이 만드는 중이라 빠질 일이 없다(T20 13장 E와 같은 판단, 2026-11-27 사용자)[^spec]

# 남은 일 / 위험
- 도착 시각이 다음 날로 넘어가도 HH:mm만 보인다. 가장 늦은 도착 시각이 정해지면 다시 본다.
- 백엔드 요청 문서의 예시에 아직 `pickupChoice`가 남아 있다. T18~T22 백엔드 추가 요청과 함께 고친다.
- 고객이 고를 수 있는 가장 늦은 시각은 앱 · 서버가 정한다.

# 히스토리
- 2026-11-27T11:00+09:00 계획 승인(A-1), 워크트리 · 브랜치 만듦, 지시서 전달 (pos-boss → 작업 세션 `t19-arrival-time-72`, 모델 Sonnet 5.5 회신)
- 2026-11-27 작업 세션 끝 보고: 완료 기준 5개 됨, ② 3 → 보류 3, ③ 10 → 고침 9 · 보류 1 (Opus). 분 경계는 T04 규칙(올림 · 정각 1분 미만 괄호 없음 · 지남 내림)
- 2026-11-27 지휘 세션 확인: diff, 검사 · 테스트 2번 다시 돌림. agent-desktop으로 Tauri 창 자동 확인 시도(X11 · Wayland 둘 다 화면 안쪽 안 읽힘) → agent-browser로 브라우저 A1~A3 통과
- 2026-11-27 사용자: 분 경계 그대로(A-1), 위젯 · 출력은 자동 테스트로 대신(B-2)

[^spec]: SPEC-order-board 12장
