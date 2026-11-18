---
type: Task Report
title: T04. 주문접수 화면
description: 주문을 탭 두 개의 카드로 보여 주고 카드 버튼으로 접수 · 제조완료 · 픽업완료를 처리하며, 픽업완료 · 고객 취소 배너를 띄운다.
tags: [order-board, react, touch]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-18T16:15:32+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-order-board.md
    title: 스펙 — 주문접수 화면 (2026-11-18 승인, 11장 G~J 구현 중 결정)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q01 · Q15 · Q17 · Q19~Q26
  - id: task
    resource: plane:WHALEERPPO-5
    title: "[F-ORDBRD] T04. 주문접수 화면"
---

# 목표
[주문접수] 탭에서 주문을 카드로 보여 주고 카드 버튼으로 상태를 바꾼다. 완료 기준은 스펙 7장 1~8[^spec].

# 작업 내용
- [주문접수] 탭이 자리표시 대신 실제 화면이 됐다. 탭 두 개: [접수대기 · 제조중 · 제조완료](최신순 / 오래된순, PC에 저장) · [픽업완료](오늘 0시 이후 결제한 주문만, 최신순)
- 첫 탭 보기 필터: 상태별 체크 + 건수. 저장하지 않아 켤 때마다 모두 체크
- 카드: `#12`(앞자리 0 없음), 상태 글자 + 색, 메뉴 3줄 + 「+ 외 N개」, 옵션 한 줄 말줄임, 요청사항 노란 2줄, 접수대기 12분부터 「3분 뒤 자동 취소」, 높이 480px 통일, 폭 약 300px, 버튼 44px 이상
- 픽업 예정: 「지금 픽업 (N분 지남)」 · 「15:45 픽업 (20분 뒤)」 · 「(1시간 이상)」 · 지나면 빨간 「N분 지남」, 1분마다 시간 글자만 갱신
- 버튼 [주문접수] · [제조완료] · [픽업완료]. 요청 중에는 막는다. 실패하면 「#12 다른 PC에서 이미 처리한 주문입니다.」처럼 픽업번호를 붙인 토스트
- 화면 아래 배너: 픽업완료 5초 + [완료 취소(05)], 고객 취소 5초. 쌓이고 따로 사라진다. [주문접수] 탭에서만 보이고, 고객 취소 알림음은 다른 탭에서도 한 번 울린다
- 카드가 한 화면을 넘을 때만 [이전] [다음] 버튼, 한 화면씩 넘긴다
- 주문 데이터의 예정 시각(`pickupAt`)을 고객이 고른 값(`pickupChoice`: now · 5min … 1hour-plus, 값 이름은 가정)으로 바꿨다. 개발용 모의 주문이 7가지 값을 돌아가며 내고 3번째마다 긴 주문(메뉴 5개 · 옵션 · 요청사항)을 낸다. 모의 [고객 취소] 버튼 추가

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t04-order-board-49`(Orca로 실행, Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T04-order-board`, 브랜치 `feature/WHALEERPPO-5-order-board`
- 접근: 판단은 `order-board-logic.ts` 순수 함수(탭별 목록 · 정렬 · 건수 · 「+ 외 N개」 · 픽업 예정 문구 · 12분 경고 · 새 고객 취소 판단)에 모으고 현재 시각을 인자로 받아 가짜 시계로 시험했다. 상태 변경은 T03의 `useOrders().changeStatus`만 쓴다. 고객 취소 알림음은 탭과 상관없이 늘 떠 있는 `CustomerCancelSound`가 맡고, 배너는 보드 화면이 맡아 둘이 겹치지 않는다. 새 라이브러리 없음
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review, pr-review-toolkit:review-pr (리뷰 서브에이전트는 모두 Opus 5.5)

# 변경 파일
- `src/features/order-board/OrderBoardScreen.tsx`: 탭 · 정렬 · 필터 · 카드 목록 · 이전/다음 · 버튼 동작 · 실패 토스트
- `src/features/order-board/OrderCard.tsx`: 카드 하나
- `src/features/order-board/BottomBanners.tsx`: 화면 아래 배너 쌓기 (T12 출력 실패 띠도 여기에 붙일 자리)
- `src/features/order-board/CustomerCancelSound.tsx`: 고객 취소 알림음 (모든 탭)
- `src/features/order-board/order-board-logic.ts`: 순수 함수
- `src/features/order-board/board-texts.ts`: 화면 문구, 픽업번호 붙인 실패 문구
- `src/features/order-board/sort-storage.ts`: 첫 탭 정렬 PC 저장
- `src/features/order-board/use-now.ts`: 1분마다 현재 시각
- `src/features/order-board/*.test.ts(x)`: 화면 테스트 · 순수 함수 테스트
- `src/shared/api/orders.ts`: `PickupChoice` · `PICKUP_CHOICE_MINUTES`, `pickupAt` → `pickupChoice`, 모의 주문 7가지 값 · 긴 주문, `dev.customerCancels`
- `src/shared/orders/orders-context.ts` · `OrdersProvider.tsx`: Context에 소리(`sound`) 추가
- `src/features/app-shell/MainContent.tsx`: [주문접수] 탭에 화면 · 알림음 연결
- 테스트 타입 반영: `AppShell.test.tsx` · `AppShell.orders.test.tsx` · `OrdersProvider.test.tsx` · `orders-state.test.ts`

# 검증
- 지휘 세션이 워크트리에서 직접 실행 (최종 B-1 반영 뒤): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm test`(30파일 413개) · `pnpm build` 모두 통과. Rust는 바꾸지 않았고 첫 보고 뒤 `cargo fmt --check` · `cargo clippy -q -- -D warnings` · `cargo test`(34개) 통과
- ② 리뷰(Opus 5.5): 지적 11건 → 고침 6(카드 높이 480 · 「+ 외 N개」 잘림, 이전/다음이 마지막 줄 버튼을 덮음, [완료 취소] 문구 없는 거절 토스트, 수량 잘림, 실패 테스트 응답 현실화, scrollBy 테스트) · 보류 5(아래 남은 일)
- ③ 리뷰(Opus 5.5, code-reviewer · pr-test-analyzer · silent-failure-hunter · comment-analyzer · type-design-analyzer): 지적 약 30건(Critical 0) → 고침 11(모르는 pickupChoice 방어, Readonly · satisfies, 주석 7건, 헛 테스트 교체와 테스트 보강 다수) · 보류 나머지(시간 갱신 정렬, 로그 문구 구분, 표 정리, 태스크 번호 주석은 T05 · T12 때 정리)
- C-1 · D-2 · B-1 반영 뒤 ② 가벼운 리뷰(Opus 5.5) 각 1회: Minor 5건 → 고침 1(주석 근거) · 보류 4(고객 취소 여러 건이면 알림음 건수만큼, 재로그인 직후 이론상 소리 한 번, 스펙 문구는 지휘 세션이 반영함, T03 메모리 판단)
- Linux 실제 창 (사용자, 머지 뒤): 창 폭 1024 / 1280 / 최대화에서 한 줄 3 / 4 / 6장, 넘칠 때만 이전/다음, 접수 → 제조완료 → 픽업완료 배너 5초 · [완료 취소], [고객 취소] 배너 — 미확인
- Windows 수동 체크리스트 (사용자, 미확인):
  1. 터치로 [주문접수] · [제조완료] · [픽업완료] · [완료 취소]가 편하게 눌리는지
  2. 터치 끌기로 세로 스크롤, 넘칠 때 [이전][다음]
  3. 정렬 선택 · 보기 필터를 터치로 조작, 껐다 켜면 정렬은 유지 · 필터는 모두 체크
  4. 1024×768 최소 창에서 카드 3장 한 줄, 480px 카드가 잘리지 않는지
  5. 한글 메뉴명 · 옵션 · 요청사항 말줄임이 자연스러운지

# 결정 사항
- 승인 때 (2026-11-18 사용자, 모두 권장안): 카드 누름은 T05에서 연결, 고객이 고른 픽업 값 사용, 12분 경고 「3분 뒤 자동 취소」 고정, 보기 필터 저장 안 함, 다른 탭에서 생긴 배너는 안 보임, 빈 화면 문구 추가[^spec]
- 구현 중 `pickupAt`을 `pickupChoice`로 교체: 예정 시각 = 결제 시각 + 고른 값이라 둘을 함께 두면 어긋날 수 있다[^spec]
- G. 연결이 끊긴 사이의 고객 취소는 배너 없이 카드만 사라짐: 끊김 빨간 띠로 알 수 있고, 안 보이는 카드는 처리할 일이 없다 (사용자)[^spec]
- H. [픽업완료] 탭은 오늘 0시 이후 결제한 주문만: 0시 서버 자동 완료된 어제 주문이 뜨지 않게. 지난 날짜는 주문내역(T07) (사용자)[^spec]
- I. 다른 탭에 있어도 고객 취소 알림음은 한 번 울림 (사용자)[^spec]
- J. 실패 토스트 앞에 「#픽업번호 」: 피크에 어느 주문인지 알게. 기획자 원문과 달라짐 (사용자)[^spec]

# 남은 일 / 위험
- 요약 팝업 · 주문취소(T05), 위젯 · 반복 알림음 · 실제 소리 파일(T06), 주문서 출력 · 「미출력」 · 출력 실패 띠(T12)
- 재연결 뒤 알게 된 고객 취소는 배너 · 알림음 없음 (결정 G)
- 어제 23:59 결제 → 0시 뒤 [픽업완료]를 누르면 5초 배너 뒤 어느 탭에도 안 보인다 (결정 H의 결과, 주문내역에서 본다)
- T03 한계: [픽업완료]가 시간 초과로 실패했는데 서버는 처리한 경우 카드가 말없이 [픽업완료] 탭으로 간다 (accept만 재확인)
- 실제 API 연결(T17) 때 `pickupChoice` 값 검사를 통신 계층에 넣어야 한다. 값 이름(now · 5min … 1hour-plus)은 가정
- T03 `orders-state.ts`는 오늘 취소된 주문을 남길지 아직 `updatedAt` 기준으로 본다. 화면 영향 없음
- 시간 글자 갱신은 카드가 뜬 시점 기준 1분마다라 최대 59초 늦을 수 있다
- 실시간 사건이 응답보다 먼저 오면 카드가 잠깐 깜빡일 수 있다 (모의에서는 안 보임)

# 히스토리
- 2026-11-18T16:15+09:00 스펙 승인 · 커밋 `3eca2eb`, 지휘 세션이 Orca로 작업 세션을 Sonnet 5.5로 열고 지시서 전달
- 2026-11-18T16:16+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인, 시작
- 2026-11-18T16:50+09:00 작업 세션 보고: 구현 · ① · ② 11건(고침 6) · ③ 약 30건(고침 11), 질문 A~E → 지휘 세션이 ① 직접 재실행 통과(412개)
- 2026-11-18T16:55+09:00 사용자 답: C-1(다른 탭 알림음), D-2(토스트에 픽업번호), E-1(한계를 OKF에) → 작업 세션 반영, ② 가벼운 리뷰 Minor 2 보류, 지휘 세션 ① 재확인
- 2026-11-18T17:05+09:00 사용자 답: A-1(끊긴 사이 취소는 카드만 사라짐, 코드 변경 없음), B-1(픽업완료 탭은 오늘 결제분) → 작업 세션 반영, ② 가벼운 리뷰 Minor 3(고침 1), 지휘 세션 ① 재확인(413개)
- 2026-11-18T17:14+09:00 스펙에 구현 중 결정 G~J 반영 · main 커밋 `a92db19`, 사용자 "A-1, B-1" → 커밋 · 머지

[^spec]: SPEC-order-board.md
