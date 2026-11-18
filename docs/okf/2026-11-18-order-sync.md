---
type: Task Report
title: T03. 주문 수신 · 상태 동기화
description: 서버 주문을 빠짐 · 중복 없이 받아 보관하고, 상태 변경을 서버 성공 뒤에만 반영하며, 연결 끊김 · 서버 자동 OFF를 화면에 알린다.
tags: [order-sync, realtime, react, mock-server]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-18T14:55:06+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-order-sync.md
    title: 스펙 — 주문 수신 · 상태 동기화 (2026-11-18 승인)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q04 · Q13 · Q16 · Q17 · Q19~Q22 · Q25 · Q28 · Q51 · Q53 · Q54
  - id: task
    resource: plane:WHALEERPPO-4
    title: T03. 주문 수신 · 상태 동기화 (화면 아님)
---

# 목표
서버 주문을 빠짐 · 중복 없이 받아 보관하고, 점원의 상태 변경을 서버 성공 뒤에만 반영하며, 연결 끊김 · 서버 자동 OFF를 화면에 알린다. 완료 기준은 스펙 10장 1~8[^spec].

# 작업 내용
- 주문 수신: 로그인 뒤 처리할 주문 · 오늘 픽업완료를 한 번에 조회하고, 실시간 사건을 반영하며, 30초마다 다시 조회해 빠진 주문을 채운다. 새 주문은 목록에 넣은 뒤 수신 확인(ack)을 보낸다
- 중복 · 순서: 같은 주문 · 이벤트(최근 1,000개)는 한 번만 넣고 "새 주문" 신호도 한 번만. 오래된 변경은 버린다. 다시시작 뒤 첫 조회는 신호 없이 채운다
- 상태 변경: 멱등키를 붙여 보내고 서버 성공 뒤에만 목록을 바꾼다. 실패 4종(다른 PC 먼저 · 고객 먼저 · 서버 오류 · 시간 초과) 문구. [픽업완료]는 즉시 보내고 [완료 취소]는 되돌리기 요청. [주문취소] 사유 필수. 같은 주문 두 번 누름은 요청 한 번
- 시간 초과 난 접수는 멱등키를 기억했다가, 그 주문이 제조중으로 들어오면 같은 키로 다시 물어 성공이면 "이 PC에서 접수됨" 신호를 낸다 (주문서 출력이 빠지지 않게)
- 연결: 15초 연결 신호, 연달아 2번 실패면 빨간 띠 「인터넷 연결이 끊겼습니다. 새 주문을 받을 수 없습니다. 다시 연결하는 중…」 + 경고음 한 번, 1 → 2 → 4 … 최대 30초 재시도, 다시 연결되면 전체 재조회
- 서버 주문받기 변경을 확인창 없이 헤더에 반영. 미접수 연속 2건 자동 OFF 때 빨간 띠(Q54 문구) + 알림음 한 번, 켜면 띠가 사라진다. 켤 때 서버가 ON이면 OFF 요청
- 모든 서버 요청 10초 제한 (로그인 · 재발급 · 주문받기 · 조회 · 상태 변경 · 연결 신호). 종료 전 주문 중단도 10초 뒤 그대로 진행
- T01에서 넘어온 것: 확인창 "처리할 주문 N건"에 실제 건수, 더보기 맨 앞 [새로고침](실패 시 토스트)
- 개발 빌드 전용 "개발용 모의 주문" 버튼(주문 1건 · 10건 · 고객 취소 · 다른 PC 접수 · 연결 끊기/잇기 · 미접수 2건 자동 OFF · 같은 주문 다시 보내기). 운영 빌드에는 버튼이 없다
- 경고음 · 알림음은 재생 함수 자리만 있다(소리 파일은 T06)

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t03-order-sync-13`(Orca로 실행, Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T03-order-sync`, 브랜치 `feature/WHALEERPPO-4-order-sync`
- 접근: 새 라이브러리 없이 useReducer + Context. 수신 · 재연결 · 상태 변경 로직은 React 밖 `order-sync.ts`로 빼서 가짜 시계 · 가짜 API로 시험했다. 실시간 전달 방식은 `OrderFeed` 인터페이스로 분리해 백엔드가 정해지면 `order-feed.ts`만 바꾼다
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review, pr-review-toolkit:review-pr (리뷰 서브에이전트 모두 Opus 5.5)
- 설계 선택: 연결 신호와 조회의 실패 횟수를 따로 센다(두 타이머가 겹칠 때 판단이 흔들리지 않게)

# 변경 파일
- 새로: `src/shared/api/orders.ts` · `order-feed.ts` · `with-timeout.ts`(+테스트), `src/shared/orders/orders-state.ts` · `order-sync.ts` · `OrdersProvider.tsx` · `orders-context.ts` · `order-texts.ts`(+테스트), `src/shared/sound/sound-player.ts`, `src/features/app-shell/StatusBanners.tsx` · `AppShell.orders.test.tsx`, `src/features/dev-mock/DevMockPanel.tsx`(+테스트)
- 고침: `App.tsx`, `src/features/app-shell/AppShell.tsx` · `AppShellContext.tsx` · `MoreMenu.tsx` · `Icons.tsx` · `app-shell-state.ts` · `AppShell.test.tsx`, `src/features/login/LoginForm.tsx` · `LoginScreen.test.tsx`, `src/shared/session/restore-session.ts`(+테스트), `src/shared/log/log-messages.ts`(+테스트)
- 지움: `src/features/app-shell/pending-orders.ts` (T01의 자리 파일, `useOrders().pendingOrderCount`로 바꿈)

# 검증
- 지휘 세션이 직접 다시 돌린 명령: `pnpm lint` → `typecheck` → `format:check` → `test` → `build` → `cargo fmt --check` · `cargo clippy -- -D warnings` · `cargo test`
- 결과: 모두 통과. 화면 테스트 28파일 364개(이전 248개), Rust 테스트 34개. 운영 빌드(`dist/`)에 모의 버튼 문구 0건. 주문 로그는 orderId · 동작 · 결과만
- ② (Opus): 지적 9건 → 고침 8(다시 연결 중 또 끊김, 취소 주문 누적, 멈춘 뒤 요청, ack 중 들어온 주문 재전송 등) · 보류 1(멱등키 → 결정 K로 해결)
- ③ (Opus 5종: code · test · silent-failure · type-design · comment): 지적 약 26건 → 고침 약 19(로그인 직후 주문받기 어긋남, 신호 받는 쪽 예외로 수신 끊김, 주문받기 맞추기 실패가 끊김으로 뜸, 테스트 보강 등) · 보류 7(결정 K~O로 넘김)
- 결정 K~O 반영 뒤 바뀐 부분 ② (Opus): Minor 7건 → 고침 6 · 넘김 1(`changeStatus` 래퍼의 타입 단언, 실행 영향 없음)
- Linux 실제 창 확인 (사용자에게 요청, 모의 버튼으로)
  1. `pnpm tauri dev` → 점포번호 계정 로그인 → 화면 왼쪽 아래 "개발용 모의 주문" 펼치기
  2. [주문 10건] → 더보기 → 프로그램 종료 확인창에 「처리할 주문이 10건 있습니다」 (취소로 닫기)
  3. [연결 끊기] → 헤더 아래 빨간 띠, [연결 잇기] → 몇 초 뒤 띠가 사라지고 그사이 만든 주문이 들어옴
  4. 주문받기 켠 뒤 [미접수 2건 자동 OFF] → 토글 OFF + 빨간 띠, 다시 켜면 띠 사라짐
  5. 더보기 맨 앞 [새로고침] → 로그인 · 주문받기 그대로
  6. [고객 취소] · [다른 PC가 접수] · [같은 주문 다시 보내기] → 건수가 중복으로 늘지 않음
- Windows 수동 확인
  1. 설치한 앱에 "개발용 모의 주문" 버튼이 없다
  2. 더보기 7칸이 1024 × 768에서 잘리지 않고 [새로고침]이 손가락으로 눌린다
  3. 빨간 띠가 헤더 아래 한 줄로 보이고 닫기 버튼이 없다 (모의 버튼으로 확인)
  4. 자동 OFF 띠 문구가 Q54 원문과 글자까지 같다

# 결정 사항
- 주문은 본 창 React에 보관, 라이브러리 없이 useReducer + Context, 요청 시간 제한 10초, 개발 빌드 전용 모의 주문 버튼, 30초 재조회 (2026-11-18 사용자 A~E)[^spec]
- [픽업완료]는 누르는 즉시 보내고 [완료 취소]는 되돌리기 요청을 따로 보낸다(픽업은 손님이 가져간 뒤 누르므로), 다시시작 뒤 첫 조회는 새 주문 알림 없음, 끊김 판단 연달아 2번, 재연결 때 주문받기 복구는 서버가, 켤 때 서버 ON이면 OFF 요청 (2026-11-18 사용자 F~J)[^spec]
- 시간 초과 뒤 늦게 처리된 접수는 다시 물어 출력 신호, [주문취소] 사유 필수, [새로고침] 실패 토스트, ack 실패는 로그만, 로그인 10초 테스트 추가 (2026-11-18 사용자 K~O, 구현 중 질문)[^spec]

# 남은 일 / 위험
- 실시간 전달 방식 · API 형태 · 상태 이름 · 멱등키 규칙은 백엔드 미정 (모의 서버 기준). 결정 K는 "같은 멱등키 재요청에 첫 결과를 돌려준다"는 가정 위에 있어 백엔드 요청 문서에 더했다
- ack의 역할은 백엔드 질문 13번
- 경고음 · 알림음 소리 파일, 크기 설정은 T06
- 주문 카드 · 팝업 · 위젯 · 출력 화면은 T04~T07 · T12
- OrdersProvider 테스트는 StrictMode 이중 마운트로는 돌려 보지 않았다 (개발 빌드는 StrictMode)

# 히스토리
- 2026-11-18T14:55+09:00 스펙 승인 · 커밋 `5ac7733`, 지휘 세션이 Orca로 작업 세션을 Sonnet 5.5로 열고 지시서 전달
- 2026-11-18T14:56+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인, TDD로 시작
- 2026-11-18 작업 세션 보고: 구현 · ① 통과, ② 지적 9건 → 고침 8 · 보류 1, ③ 에이전트 5종 지적 약 26건 → 고침 약 19 · 보류 7 (리뷰 모델 모두 Opus 5.5). 결정 필요 6건(시간 초과 뒤 접수 신호, 취소 사유 필수, 새로고침 실패 문구, ack 실패, 스펙 4장 문구, 로그인 10초 테스트)
- 2026-11-18T15:21+09:00 지휘 세션 확인: ① 재실행 통과 (화면 테스트 28파일 350개, cargo test 34개), 운영 빌드(dist)에 모의 버튼 문구 0건, 주문 로그는 orderId · 동작 · 결과만
- 2026-11-18 사용자 결정 A~F(스펙 K~O) → 작업 세션 반영, ① 통과, 바뀐 부분 ② 지적 7건 → 고침 6 · 넘김 1
- 2026-11-18T15:53+09:00 지휘 세션 확인: ① 재실행 통과 (화면 테스트 364개, cargo test 34개), 운영 빌드 모의 버튼 문구 0건
- 2026-11-18 사용자 "A-1" → 커밋 · main 머지

[^spec]: SPEC-order-sync.md
