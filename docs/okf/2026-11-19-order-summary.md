---
type: Task Report
title: T05. 주문 요약 팝업 · 주문취소 팝업
description: 주문 카드를 누르면 요약 팝업에서 처리 단계 · 주문 정보를 보고 다음 단계 처리와 사유를 고른 주문취소를 한다.
tags: [order-summary, react, touch]
status: stable
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-19T10:21:05+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-order-summary.md
    title: 스펙 — 주문 요약 팝업 · 주문취소 팝업 (2026-11-19 승인, 11장 F~I 구현 중 결정)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q16 · Q17 · Q18 · Q27 · Q28 · Q40
  - id: task
    resource: plane:WHALEERPPO-6
    title: "[F-ORDSUM] T05. 주문 요약 팝업 · 주문취소 팝업"
verified:
  - by: human:yjnoh
    at: 2026-11-19T10:56:38+09:00
---

# 목표
주문 카드를 누르면 주문 한 건을 자세히 보이고, 그 자리에서 다음 단계 처리와 주문취소를 한다. 완료 기준은 스펙 8장 1~7[^spec].

# 작업 내용
- 카드(버튼 밖)를 누르거나 키보드 Enter · Space로 요약 팝업이 열린다. ×, 바깥 영역, Esc로 닫히고 닫으면 초점이 카드로 돌아간다
- 처리 단계 접수대기 → 제조중 → 제조완료 → 픽업완료. 지난 단계는 체크 + 시:분, 현재 단계 강조, 픽업완료 상태면 모든 단계 체크 + 시각
- 기본 정보: 주문일시, 16자리 주문번호, 픽업 예정(카드와 같은 문구), 가린 고객명, 연락처 「***-****-1234」. 요청사항 · 메뉴 전체(옵션은 쉼표 한 줄), 팝업 안 세로 스크롤
- 상태별 버튼(Q27): 접수대기 [주문취소] [주문접수★] · 제조중 [주문취소] [제조완료★] · 제조완료 [픽업완료★](취소 막힘) · 픽업완료 없음. [영수증 인쇄] · [주문서 인쇄]는 회색으로 막아 둠(T12)
- 다음 단계를 누르면 팝업이 열린 채 새 상태로 바뀌고, [픽업완료]면 닫히고 T04 배너 5초 + [완료 취소]. 실패하면 「#12 …」 토스트
- 주문취소 팝업: 사유 4개 + 직접 입력(보이는 글자 50자, 줄바꿈 없음, 붙여넣기 초과 안내, 한글 조합 중에는 자르지 않음). 처음엔 선택 없음, 사유를 골라야 [주문취소]. 성공하면 두 팝업이 닫히고 카드가 사라짐, 실패하면 사유 유지 + 토스트. orderId 하나만 받아 T06 위젯에서도 쓸 수 있음
- 열린 동안 다른 PC가 바꾸면 바로 갱신. 목록에서 사라지면 두 팝업을 닫고, 고객 취소면 T04 배너, 그 밖이면 「#12 다른 PC에서 이미 처리한 주문입니다.」 토스트. 내가 닫거나 내가 취소한 경우는 토스트 없음
- 주문 데이터에 상태별 시각 `statusTimes`(preparingAt · readyAt · pickedUpAt, ms 또는 null)를 더했다. 모의 서버가 상태 변경마다 채우고, [완료 취소]는 pickedUpAt만 지운다

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t05-order-summary-7b`(Orca로 실행, Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T05-order-summary`, 브랜치 `feature/WHALEERPPO-6-order-summary`
- 접근: 상태별 버튼 표 · 단계 표시 · 사유 검사 · 글자 수는 `summary-logic.ts` 순수 함수로 두고 시험했다. 팝업은 T04 `OrderBoardScreen`이 열고 닫으며, 상태 변경은 `useOrders().changeStatus`만 쓴다. 실패 토스트 · 픽업 예정 문구는 T04 것을 재사용했다. 글자 수는 브라우저 기본 `Intl.Segmenter`(타입을 위해 `tsconfig.json` lib에 `ES2022.Intl` 추가). T03의 로컬 `pickedUpAt`(5초 완료 취소 창을 재는 PC 시각)은 서버 시각과 용도가 달라 그대로 두었다. 새 라이브러리 없음
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review, pr-review-toolkit:review-pr (리뷰 서브에이전트는 모두 Opus 5.5)

# 변경 파일
- `src/features/order-summary/OrderSummaryDialog.tsx`: 요약 팝업
- `src/features/order-summary/CancelReasonDialog.tsx`: 취소 사유 팝업 (T06 재사용)
- `src/features/order-summary/summary-logic.ts` · `summary-texts.ts`: 순수 함수 · 문구
- `src/features/order-summary/*.test.ts(x)`: 순수 함수 · 화면 테스트
- `src/features/order-board/OrderBoardScreen.tsx`: 카드 `onOpen` 연결, 팝업 여닫기 · 다른 PC 처리 토스트, 실패 토스트 공용화
- `src/features/order-board/OrderCard.tsx`: 픽업 예정 문구 내보내기, 키보드로 열기
- `src/shared/api/orders.ts` · `orders.test.ts`: `statusTimes` 타입 · 모의 서버
- 테스트 데이터 반영: `order-board-logic.test.ts` · `OrdersProvider.test.tsx` · `orders-state.test.ts`
- `tsconfig.json`: lib에 `ES2022.Intl`

# 검증
- 지휘 세션이 워크트리에서 직접 실행 (최종 A-2 · B-2 반영 뒤): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm test`(451개) · `pnpm build` 통과. Rust는 바꾸지 않았고 첫 보고 뒤 `cargo fmt --check` · `cargo clippy -q -- -D warnings` · `cargo test`(34개) 통과
- ② 리뷰(Opus 5.5): 지적 6건 → 고침 3(요청 중 다른 카드를 열면 늦은 응답이 그 팝업을 닫던 경합, 제조완료로 바뀌면 사유 팝업도 닫기, 한글 조합 중 50자 자르기) · 보류 3(픽업완료 시각 → 사용자 결정 A-2로 반영, 취소 성공 뒤 초점 자리, 초점 가두기 없음 — 공용 ConfirmDialog와 같음)
- ③ 리뷰(Opus 5.5, code-reviewer · type-design-analyzer · silent-failure-hunter · pr-test-analyzer · comment-analyzer): 고침 12(사유 팝업이 저절로 닫힌 뒤 Esc가 안 먹던 버그, 완료 취소 때 readyAt 덮어쓰기, 사유 타입 좁히기, changeStatus가 던질 때 팝업에 갇힘, 무반응 경로, IME · 요청 중 잠금 테스트, 틀린 주석 5곳 등) · 보류는 영향이 작거나 스펙 밖(사용자 결정 B~D로 정리)
- A-2 · B-2 반영 뒤 ② 가벼운 리뷰(Opus 5.5): 지적 5건 → 고침 3(내 취소 표시 정리, 같은 주문 재안내 막기 초기화, 내가 닫을 때 토스트 없음 테스트) · 보류 2(아래 남은 일, busy 거절 뒤 표시가 남는 것 — 버튼이 막혀 사실상 없음)
- Linux 실제 창 (사용자, 머지 뒤): 지휘 세션이 `pnpm tauri dev`로 켜고 사용자가 확인 순서 1~5대로 확인, 정상 (2026-11-19). 첫 실행 때 앱이 `free(): corrupted unsorted chunks`로 한 번 꺼졌고 다시 켜니 정상 — 원인 미확인 (webkit2gtk 일시 문제인지 지켜볼 것)
- Windows 수동 체크리스트 (사용자, 미확인):
  1. 터치로 카드 · 버튼(44px 이상) · 사유 선택 · 입력칸 조작
  2. 한글 직접 입력: 50자 근처에서 조합 중 글자가 깨지지 않는지, 이모지 포함 50자 계산
  3. 메뉴가 많은 주문에서 팝업 안 손가락 스크롤
  4. 1024 × 768에서 팝업이 화면 안에 들어오는지
  5. 인쇄 버튼 두 개가 회색으로 막혀 있는지

# 결정 사항
- 승인 때 (2026-11-19 사용자, 모두 권장안): 인쇄 버튼은 보이고 막아 둠, 주문 데이터에 상태별 시각 추가, 열린 동안 취소되면 팝업 닫음, 다음 단계 뒤 팝업 유지([픽업완료]만 닫음), 연락처 「***-****-1234」[^spec]
- F. 픽업완료 상태면 마지막 단계에도 체크 + 시각 ([픽업완료] 탭 카드를 열 때 필요) (사용자)[^spec]
- G. 내가 누르지 않았는데 팝업이 닫히면 고객 취소가 아닐 때 「#12 다른 PC에서 이미 처리한 주문입니다.」 (사용자)[^spec]
- H. 드문 거절(로그아웃 직후 등)은 지금처럼 안내 없음 (사용자)[^spec]
- I. 취소 실패 뒤 사유를 바꿔 다시 보낼 때의 같은 멱등키는 백엔드 협의(요청 문서 5장 질문 14) 뒤 정함 (사용자)[^spec]

# 남은 일 / 위험
- 실제 인쇄(T12), 위젯에서 열기 · 사유 팝업 재사용(T06), 취소 주문의 요약과 주문내역 상세(T07)
- 열린 팝업의 주문이 15분 자동취소 · 0시 정리로 사라져도 「다른 PC에서 이미 처리한 주문입니다.」가 뜬다. 실제로는 서버 처리라 문구가 부정확하다. 따로 문구를 둘지 기획자에게 물을 수 있다
- 취소 실패 뒤 사유를 바꿔 다시 누르면 같은 멱등키로 가서 서버가 처음 사유로 확정할 수 있다 (결정 I)
- 서버가 지운 주문을 다시 주는 앞뒤 안 맞는 응답이면 팝업이 다시 열릴 수 있다 (영향 낮음)
- Linux 첫 실행에서 앱이 메모리 오류로 한 번 꺼졌다(재실행 정상, 원인 미확인)
- 팝업 안 초점 가두기가 없다 (공용 ConfirmDialog와 같음, 키보드 사용자만 영향)

# 히스토리
- 2026-11-19T10:21+09:00 스펙 승인 · 커밋 `aae3023`, 지휘 세션이 Orca로 작업 세션을 Sonnet 5.5로 열고 지시서 전달
- 2026-11-19T10:21+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인, 시작
- 2026-11-19T10:40+09:00 작업 세션 보고: 구현 · ① · ② 6건(고침 3) · ③(고침 12), 질문 A~D → 지휘 세션 ① 직접 재실행 통과(445개)
- 2026-11-19T10:43+09:00 사용자 답: A-2(픽업완료 시각), B-2(다른 PC 처리 토스트), C-1, D-1(백엔드 질문 14) → 작업 세션 반영, ② 가벼운 리뷰 5건(고침 3), 지휘 세션 ① 재확인(451개)
- 2026-11-19T10:48+09:00 스펙 결정 F~I · 백엔드 질문 14 main 커밋 `af6f0f4`, 사용자 "A-1, B-1" → 커밋 · 머지
- 2026-11-19T10:56+09:00 머지 `44b375e`, main에서 ① pnpm 5종 통과(451개). 지휘 세션이 앱을 켜고 사용자가 실제 창 확인, 사용자 "A-1"로 OKF 승인(stable)

[^spec]: SPEC-order-summary.md
