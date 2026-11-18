# 스펙 목록

- 기능 지도(무엇을 어떤 순서로 만드는지)는 `docs/tasks/README.md`다. 스펙 파일 이름의 모듈 id는 아래 표를 따르고, 한 번 정하면 바꾸지 않는다.
- 스펙은 태스크를 구현하기 전에 쓰고, 사용자 승인을 받은 뒤 구현한다. 결정이 바뀌면 스펙을 먼저 고친다.

| 모듈 id | 태스크 | Plane | 스펙 | 상태 |
|---|---|---|---|---|
| `project-skeleton` | T00 프로젝트 골격 | WHALEERPPO-1 | 없음 (지시서로 진행) | 진행 중 |
| `app-shell` | T01 프로그램 틀 · 헤더 · 창 제어 | WHALEERPPO-2 | [SPEC-app-shell.md](./SPEC-app-shell.md) | 승인 (2026-11-16) |
| `login` | T02 로그인 | WHALEERPPO-3 | [SPEC-login.md](./SPEC-login.md) | 승인 (2026-11-18 개정, 기획자 답변 반영) |
| `settings-printer` | T11 환경설정 — 프린터설정 | WHALEERPPO-12 | [SPEC-settings-printer.md](./SPEC-settings-printer.md) | 승인 (2026-11-18 개정, 기획자 답변 반영) |
| `logging` | T14 공통 로그 · 오류 기록 | WHALEERPPO-15 | [SPEC-logging.md](./SPEC-logging.md) | 승인 (2026-11-17) |

빌드 순서: `project-skeleton` → `app-shell` → `login` → `settings-printer` → `logging`

구현 계획은 `docs/plans/PLAN-<모듈 id>.md`에 둔다. 단계는 그 문서의 체크리스트로 관리하고, Plane에는 태스크 하나만 둔다.
