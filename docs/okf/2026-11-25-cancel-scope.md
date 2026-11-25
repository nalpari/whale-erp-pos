---
type: Task Report
title: T18 매장 취소 범위 넓히기
description: 매장이 제조완료와 결제한 날 0시 전의 픽업완료 주문까지 취소할 수 있게 한다.
tags: [order-summary, order-history, order-sync]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-25T16:40:00+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-order-summary.md
    title: 12장 개정 — 매장 취소 범위 넓히기
  - id: task
    resource: plane:WHALEERPPO-51
    title: "[F-ORDSUM] T18. 매장 취소 범위 넓히기"
---

# 목표
매장이 접수대기 · 제조중에 더해 제조완료와 결제한 날 0시 전의 픽업완료 주문을 [주문취소]할 수 있게 한다. 고객 앱 취소와 위젯 버튼은 그대로.[^spec]

# 작업 내용
- 요약 팝업 · 주문내역 상세에서 제조완료와 오늘 결제한 픽업완료 주문에 [주문취소]가 켜진다. 지난 날 결제한 픽업완료에는 버튼이 없다.
- 픽업완료 주문을 취소하면 [픽업완료] 탭에서 빠지고 주문내역 「취소」 탭으로 간다. 5초 [완료 취소] 배너 중에 취소하면 배너도 사라진다.
- 서버가 결제한 날 0시가 지나 거절하면(`too-late`, 모의 서버 가정) 상태는 그대로 두고 「#12 취소할 수 있는 시간이 지났습니다.」를 보인다.
- 위젯 버튼과 [재제조](T21)는 바꾸지 않았다.

# 작업 방법
- 진행: 지휘 세션 pos-boss / 작업 세션 t18-cancel-scope-b7 (Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T18-cancel-scope`, 브랜치 `feature/WHALEERPPO-51-cancel-scope`

# 변경 파일
- `src/shared/orders/orders-state.ts`: 취소 가능 상태에 제조완료 · 픽업완료
- `src/features/order-summary/summary-logic.ts`: `summaryButtons(status, paidAt, now)`, 픽업완료는 오늘 결제분만
- `src/features/order-summary/OrderSummaryDialog.tsx` · `src/features/order-history/HistoryDetail.tsx`: 연 시각을 넘김
- `src/shared/api/orders.ts`: 결과 종류 `too-late`, 모의 서버 취소 범위 · 0시 거절
- `src/shared/orders/order-sync.ts` · `order-texts.ts` · `src/shared/log/log-messages.ts`: `too-late` 처리 · 문구 · 로그(주문 ID만)
- `src/features/order-board/order-board-logic.ts` · `OrderBoardScreen.tsx`: 취소된 주문을 5초 배너 중에도 첫 탭과 배너에서 뺌
- `src/features/order-summary/CancelReasonDialog.tsx`: too-late면 사유 팝업을 닫게 알림(A-1)
- 테스트 8파일

# 검증
- 지휘 세션이 워크트리에서 다시 실행(2026-11-25): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm test`(61파일 812건, A-1 수정 뒤) · `pnpm build` 모두 통과. Rust는 바꾸지 않아 작업 세션 결과(fmt · clippy · test 53건 통과)를 그대로 적는다.
- ② superpowers:requesting-code-review (Opus): 지적 5건 → 고침 3 · 보류 2(too-late 뒤 사유 팝업 처리는 사용자 결정 필요, `startOfDay` 두 곳 중복은 기존 것)
- ③ pr-review-toolkit:review-pr (Opus, code-reviewer · pr-test-analyzer · silent-failure-hunter): 중요 3 · 사소 11 → 테스트 중요 3건과 배너 문제 · 주석 고침, 나머지 보류(문구 고정 · 백엔드 협의 전 가정)
- 실제 창 확인은 아직 안 함

# 결정 사항
- 그날 픽업완료 버튼은 화면이 PC 시계로 오늘 결제한 주문인지 보고 보이고, 최종 판단은 서버(거절 종류 `too-late`, 모의 서버 가정)[^spec]

# 남은 일 / 위험
- `too-late` 거절 종류는 백엔드 요청 문서에 없다. 실제 API는 T17에서 맞춘다.

# 히스토리
- 2026-11-25T16:40+09:00 사용자 계획 승인 → 워크트리 · 브랜치 생성, OKF 초안 작성 (pos-boss)
- 2026-11-25T16:45+09:00 지시서 전달 (pos-boss → t18-cancel-scope-b7), 작업 세션 모델 회신: Sonnet 5.5
- 2026-11-25 작업 세션 보고: 구현 + ① ② ③ 완료 → 지휘 세션이 diff 확인 · ① 화면 쪽 다시 실행해 통과 확인
- 2026-11-25 작업 세션 질문: too-late 뒤 사유 팝업 처리 → 사용자 A-1(닫고 최신 상태로 다시 그림), 스펙 12장에 적고 작업 세션에 수정 요청
- 2026-11-25 작업 세션 보고: A-1 반영(`CancelReasonDialog` onTooLate), ② 지적 3건 → 고침 1 · 보류 2(PC · 서버 시계 차이, 테스트 겹침) → 지휘 세션이 ① 화면 쪽 다시 실행해 통과(812건)
- 2026-11-25 사용자 "커밋해" (A-1, 실제 창 확인은 머지 뒤 B-1)

[^spec]: `docs/specs/SPEC-order-summary.md` 12장 (2026-11-25 승인)
