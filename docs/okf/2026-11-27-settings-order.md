---
type: Task Report
title: T20 환경설정 — 주문설정
description: 환경설정에 [주문설정] 탭을 만들어 자동 취소 시간과 도착 최소 시간을 매장이 정하고, 카드 경고를 주문의 자동 취소 예정 시각 기준으로 바꾼다.
tags: [settings-order, order-board, order-sync]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-27T10:00:00+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-settings-order.md
    title: 환경설정 — 주문설정
  - id: task
    resource: plane:WHALEERPPO-53
    title: T20 환경설정 — 주문설정
---

# 목표
- 환경설정 하위 탭에 [주문설정]을 더한다(위젯설정 / 프린터설정 / 주문설정).
- 자동 취소 시간(5~30분, 기본 15분)과 도착 최소 시간(5~30분, 기본 5분)을 두 계정 모두 바꾼다. 바꾸면 바로 서버에 저장하고, 실패하면 되돌린다.
- 카드의 「3분 뒤 자동 취소」 경고가 주문의 `autoCancelAt − 3분`부터 뜬다.

# 작업 내용
- 환경설정 하위 탭에 [주문설정]이 생겼다(위젯설정 / 프린터설정 / 주문설정). 두 계정 모두 쓸 수 있다.
- 자동 취소 시간 · 도착 최소 시간을 5~30분(5분 단위)에서 고른다. 바꾸면 바로 저장하고 「저장되었습니다」, 실패하면 이전 값으로 되돌리고 안내한다. 저장이 시간 초과면 서버에서 다시 읽어 실제 값을 보인다.
- 주문마다 서버가 준 자동 취소 예정 시각(`autoCancelAt`) 3분 전부터 카드에 「3분 뒤 자동 취소」가 뜬다. 설정을 바꾸면 그 뒤 들어온 주문부터 적용된다.
- 저장 중에는 선택지와 메인 탭 · 하위 탭 이동을 막는다(매장정보 · 메뉴품절과 같은 방식).

# 작업 방법
- 진행: 지휘 세션 pos-boss / 작업 세션(Orca가 정함), 워크트리 `~/.whale-smart-pos-worktrees/T20-settings-order` · 브랜치 `feature/WHALEERPPO-53-settings-order`

# 변경 파일
- `src/shared/api/order-settings.ts` · `order-settings-context.ts` (새): 점포 주문설정 읽기 · 저장 인터페이스, 모의 구현(가정 주석, 10초 제한), 선택지 · 기본값
- `src/features/settings-order/` (새): 주문설정 화면 · 문구 · 테스트
- `src/shared/api/orders.ts`: `Order.autoCancelAt`(필수). 모의 주문 서버가 주문설정 모의를 가지고 새 주문을 paidAt + 그때의 분으로 채움. 연결이 끊기면 설정 읽기 · 저장도 실패
- `src/features/order-board/order-board-logic.ts`: 12분 고정 → `autoCancelAt − 3분`
- `src/features/app-shell/tabs.ts` · `MainContent.tsx` · `src/app/App.tsx`: 탭 연결, 저장 중 탭 이동 막기, 컨텍스트 연결
- `src/shared/log/log-messages.ts`: 설정 읽기 · 저장 실패(원인 이름만), 저장 성공(항목 · 분)
- `src/shared/api/order-history.ts`: 지난 주문 모의 `autoCancelAt` = paidAt + 15분
- 테스트 픽스처 6곳 `autoCancelAt` 추가, AppShell 하위 탭 3개, order-board-logic 경고 3가지, orders 13장 B
- `docs/specs/SPEC-settings-order.md`: 탭 순서, 13장 D · E · F, 4장 시간 초과 예외
- `docs/test-scenarios/T20-settings-order.md` (새)

# 검증
- 작업 세션 ①: lint · typecheck · format:check · build, Rust 3종(cargo test 53개) 통과. `pnpm test` 5번 연속 853 통과 · 5 skip
- 지휘 세션이 다시 돌림: typecheck · lint · format:check 통과, `pnpm test` 853 통과 · 5 skip(AiPopularTab). 첫 확인 때 흔들리는 테스트 1건을 찾아 고치게 함(히스토리)
- 리뷰 (Opus 5.5): ② 지적 5 → 고침 3 · 보류 2, ③ 지적 7 → 고침 5 · 보류 2. 보류 중 시간 초과 처리는 사용자 A-2로 반영, 화면 단위 연결 테스트는 실제 창 확인으로 대신. A-2 바뀐 부분 ② 지적 Minor 2 → 고침 2
- 실제 창: `docs/test-scenarios/T20-settings-order.md`. 2026-11-27 사용자가 A1~A3(탭 순서 · 화면 크기 · 저장 토스트) 확인. 나머지는 사용자 결정으로 자동 테스트로 대신

# 결정 사항
- 주문마다 서버가 자동 취소 예정 시각 `autoCancelAt`을 준다(사용자 A-1): 서버가 실제로 취소하는 시각과 화면 경고가 어긋나지 않는다[^spec]
- 저장이 시간 초과로 끝나면 실패 토스트 뒤 서버에서 다시 읽어 실제 값을 보인다(사용자 A-2): 그냥 되돌리면 서버는 바뀌었는데 화면은 옛값일 수 있다[^spec]
- 값이 없으면 기본 15분으로 본다(사용자 B-1). 서버도 같이 만드는 중이라 빠질 일은 없다고 사용자가 확인해, 주문 타입에서는 필수로 두고 빈 값 처리는 T17에서 응답을 읽는 곳에 둔다[^spec]

# 남은 일 / 위험
- 백엔드 요청 문서에 주문설정 API와 `autoCancelAt`을 더하는 일은 T18~T22 추가 요청과 함께 따로 한다.
- 명세 보관소 S-ACSETG 탭 순서와 SPEC-settings-order의 DC 항목은 머지 뒤 고친다.

# 히스토리
- 2026-11-27T09:50+09:00 계획 승인: 사용자 A-1(`autoCancelAt`) · B-1(없으면 15분). 서버도 같이 만드는 중이라 값이 빠질 일은 없다는 사용자 말 → 스펙 13장 D · E, 3장 탭 순서(인기메뉴 숨김 반영) 고침
- 2026-11-27T10:00+09:00 워크트리 · 브랜치 만듦, 지시서 전달 (pos-boss → 작업 세션 `t20-settings-order-44`, 모델 Sonnet 5.5 회신)
- 2026-11-27 작업 세션 끝 보고: 완료 기준 5개 됨, ② 지적 5 → 고침 3 · 보류 2, ③ 지적 7 → 고침 5 · 보류 2 (리뷰 Opus)
- 2026-11-27 지휘 세션 확인: 전체 테스트 첫 실행에서 「저장 중 탭 이동 막기」 1건 실패(부하 시 타이밍) → 작업 세션이 토스트와 잠금 해제를 같은 렌더로 맞춤, 전체 5번 연속 통과. 지휘 세션 2번 다시 돌려 851 통과
- 2026-11-27 리뷰 보류 지적(저장 시간 초과 때 서버 값과 화면이 달라짐) → 사용자 A-2: 시간 초과면 토스트 뒤 서버에서 다시 읽음. 스펙 4장 · 13장 F 추가, 작업 세션에 전달
- 2026-11-27 A-2 반영 보고: 시간 초과면 다시 읽기, 테스트 2개, ② Minor 2 고침 → 지휘 세션 확인(853 통과), 시나리오 문서 작성
- 2026-11-27 사용자 실제 창 A1~A3 확인, 나머지는 자동 테스트로 대신하기로 함(A-1)

[^spec]: SPEC-settings-order 5장 · 13장 D · E
