# 스펙 목록

- 기능 지도(무엇을 어떤 순서로 만드는지)는 `docs/tasks/README.md`다. 스펙 파일 이름의 모듈 id는 아래 표를 따르고, 한 번 정하면 바꾸지 않는다.
- 스펙은 태스크를 구현하기 전에 쓰고, 사용자 승인을 받은 뒤 구현한다. 결정이 바뀌면 스펙을 먼저 고친다.

| 모듈 id | 태스크 | Plane | 스펙 | 상태 |
|---|---|---|---|---|
| `project-skeleton` | T00 프로젝트 골격 | WHALEERPPO-1 | 없음 (지시서로 진행) | 진행 중 |
| `app-shell` | T01 프로그램 틀 · 헤더 · 창 제어 | WHALEERPPO-2 | [SPEC-app-shell.md](./SPEC-app-shell.md) | 승인 (2026-11-18 개정, 기획자 답변 반영) |
| `login` | T02 로그인 | WHALEERPPO-3 | [SPEC-login.md](./SPEC-login.md) | 승인 (2026-11-18 개정, 기획자 답변 반영) |
| `settings-printer` | T11 환경설정 — 프린터설정 | WHALEERPPO-12 | [SPEC-settings-printer.md](./SPEC-settings-printer.md) | 승인 (2026-11-18 개정, 기획자 답변 반영) |
| `logging` | T14 공통 로그 · 오류 기록 | WHALEERPPO-15 | [SPEC-logging.md](./SPEC-logging.md) | 승인 (2026-11-17) |
| `order-sync` | T03 주문 수신 · 상태 동기화 | WHALEERPPO-4 | [SPEC-order-sync.md](./SPEC-order-sync.md) | 승인 (2026-11-18) |
| `order-board` | T04 주문접수 화면 | WHALEERPPO-5 | [SPEC-order-board.md](./SPEC-order-board.md) | 승인 (2026-11-18) |
| `order-summary` | T05 주문 요약 팝업 · 주문취소 팝업 | WHALEERPPO-6 | [SPEC-order-summary.md](./SPEC-order-summary.md) | 승인 (2026-11-19) |
| `desktop-widget` | T06 바탕화면 주문 알림 위젯 · 알림음 | WHALEERPPO-7 | [SPEC-desktop-widget.md](./SPEC-desktop-widget.md) | 승인 (2026-11-19) |
| `settings-widget` | T10 환경설정 — 위젯설정 · 알림음 | WHALEERPPO-11 | [SPEC-settings-widget.md](./SPEC-settings-widget.md) | 승인 (2026-11-19) |
| `order-history` | T07 주문내역 · 주문내역 상세 | WHALEERPPO-8 | [SPEC-order-history.md](./SPEC-order-history.md) | 승인 (2026-11-19) |
| `store-info` | T08 매장정보 | WHALEERPPO-9 | [SPEC-store-info.md](./SPEC-store-info.md) | 승인 (2026-11-19) |

빌드 순서: `project-skeleton` → `app-shell` → `login` → `settings-printer` → `logging` → `order-sync` → `order-board` → `order-summary` → `desktop-widget` → `settings-widget` → `order-history` → `store-info`

구현 계획은 `docs/plans/PLAN-<모듈 id>.md`에 둔다. 단계는 그 문서의 체크리스트로 관리하고, Plane에는 태스크 하나만 둔다.
