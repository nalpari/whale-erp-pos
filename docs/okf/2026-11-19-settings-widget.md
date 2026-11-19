---
type: Task Report
title: T10. 환경설정 — 위젯설정 · 알림음
description: 위젯에 보일 주문 상태 · 위젯 위치 · 알림음 크기를 PC마다 정하고 바로 위젯 · 알림음에 반영한다.
tags: [settings-widget, sound, desktop-widget]
status: draft
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-19T12:25:21+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-settings-widget.md
    title: 스펙 — 환경설정 위젯설정 · 알림음 (2026-11-19 승인, 11장 D · E 구현 중 결정, 12장 개발용 전체 삭제)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q10 · Q15 · Q31 · Q44 · Q45
  - id: task
    resource: plane:WHALEERPPO-11
    title: "[F-WDGSET] T10. 환경설정 — 위젯설정 · 알림음"
---

# 목표
환경설정 [위젯설정] 탭에서 위젯 표시 상태 · 위치 · 알림음 크기를 PC마다 정하고 바로 반영한다. 완료 기준은 스펙 10장 1~6[^spec].

# 작업 내용
- [위젯설정] 탭이 자리표시 대신 실제 화면이 됐다. 제목 「바탕화면에 주문 알림 위젯을 표시합니다.」, 점포번호 · 웨일ERP 계정 모두 변경 가능(Q10)
- 표시 상태: 접수대기 늘 체크 · 막힘(「항상 표시」), 제조중 · 제조완료 체크. 픽업완료 칸 없음
- 위젯 위치: 우상단 · 좌상단 · 우하단(기본) · 좌하단. 떠 있는 위젯도 바로 옮겨진다
- 알림음 크기: 슬라이더 20~100(10 단위, 기본 40, 숫자 표시). 20 = 지금 소리의 절반, 40 = T06 소리, 100 = 2배. 크게 해도 깨지지 않게 소리 상한 장치(Web Audio 웨이브셰이퍼)를 거친다. [새 주문 미리듣기] [경고 미리듣기]는 지금 값으로
- 미리보기: 화면 모양 상자의 고른 모서리에 예시 위젯 카드, `<` `>`로 접수대기 · 제조중 · 제조완료 예시. 끈 상태 예시에는 「위젯에 표시 안 함」
- 바꾸면 바로 PC에 저장되고 「저장되었습니다」 토스트. 다시 켜도 유지. 깨진 값은 그 항목만 기본값 + 로그
- 개발용 모의 패널에 [전체 주문 삭제]: 모의 서버 주문 전부 삭제 → 화면 · 위젯 · 30초 알림음이 비고, 다음 주문은 #1부터. 운영 빌드에는 버튼이 없다

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t10-settings-widget-70`(Orca로 실행, Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T10-settings-widget`, 브랜치 `feature/WHALEERPPO-11-settings-widget`
- 접근: 설정은 앱 저장소(localStorage 키 `widgetSettings`, 정렬 저장과 같은 방식)에 두고 Context로 본 창에 나눠 준다. 위젯 창은 설정을 직접 읽지 않고, 본 창이 T06 구조대로 위치(`WidgetView.position`)와 거른 카드를 보낸다. 크기 배율은 40 이하 v/40, 40 위 1+(v−40)/60. 전체 삭제는 모의 서버의 새 사건 `orders-cleared`로 주문 상태를 비우며, 운영 빌드에서 이 사건이 오면 무시하고 로그를 남긴다. 새 라이브러리 없음
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review, pr-review-toolkit:review-pr (리뷰 서브에이전트는 모두 Opus 5.5)

# 변경 파일
- `src/features/settings-widget/`: 설정 읽기 · 쓰기(`widget-settings`), Context, 화면(`WidgetSettingsScreen`), 미리보기(`WidgetPreview`), 문구, 테스트
- `src/features/app-shell/MainContent.tsx` · `src/app/App.tsx`: [위젯설정] 탭 연결, 설정 Context
- `src/features/desktop-widget/`(`DesktopWidgetProvider` · `WidgetApp` · `widget-host` · `widget-position` · `widget-protocol` + 테스트): 설정의 위치 · 표시 상태 사용
- `src/shared/sound/`(`sound-player` · `web-audio-player` + 테스트): 크기 값 · 소리 상한 장치
- `src/features/dev-mock/DevMockPanel.tsx`(+테스트), `src/shared/api/orders.ts` · `order-feed.ts`(+테스트), `src/shared/orders/order-sync.ts`: [전체 주문 삭제]
- `src/shared/log/log-messages.ts`: 설정 읽기 실패 · 리미터 · 전체 삭제 무시 로그

# 검증
- 지휘 세션이 워크트리에서 직접 실행 (최종 A-2 · B-2 반영 뒤): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm test`(554개) · `pnpm build` 통과. 첫 보고 뒤 `cargo fmt --check` · `cargo clippy -q -- -D warnings` · `cargo test`(35개) 통과(Rust 변경 없음). 운영 빌드 `dist/`에 「전체 주문 삭제」 · 「개발용 모의 주문」 0건
- ② 리뷰(Opus 5.5): Important 4 · Minor 7 → 고침 9(로그 누락, 리미터 곡선 · 오버샘플, 전체 삭제 뒤 orderId 재사용, eslint-disable 제거 등) · 보류 2(깨진 값 다시 저장 안 함, 설정 실패 문구가 프린터설정과 같음)
- ③ 리뷰(Opus 5.5, code-reviewer · silent-failure-hunter · comment-analyzer · pr-test-analyzer): 고침 — 리미터 생성 실패 대비 + 로그, 운영에서 전체 삭제 사건 무시 + 로그, 크기 값 정리, 주석 정정, 테스트 6건 보강. 보류 — 미리보기 상태 표시(사용자 결정 B-2로 반영), 삭제 직후 늦은 응답(개발용), 로그 문구 세분화 등
- A-2 · B-2 반영 뒤 ② 가벼운 리뷰(Opus 5.5): 고침 — 리미터 주석, 80 < 90 < 100 테스트, 크기 범위 테스트. 보류 — 다시 켰을 때 표시가 사라지는지 테스트(낮음)
- Linux 실제 창 (사용자, 머지 뒤 X11): 미확인
- Windows 수동 체크리스트 (사용자, 미확인):
  1. 1024×768에서 위젯설정 화면이 들어가는지(안 들어가면 세로 스크롤만)
  2. 손가락으로 체크 · 위치 · 슬라이더 손잡이 · `<` `>` · 미리듣기가 잘 눌리는지
  3. 위치 4개 모두 주 모니터 작업 영역 모서리 여백 16px, 화면 배율 125 · 150%에서도
  4. 알림음 100에서 깨지지 않는지, 20에서도 들리는지, 단계 차이가 들리는지
  5. 재시작 뒤 위치 · 크기 · 체크 유지, 「저장되었습니다」 토스트
  6. 설치 파일에 [전체 주문 삭제] 패널이 없는지

# 결정 사항
- 승인 때 (2026-11-19 사용자, 모두 권장안): 바꾸면 바로 저장 + 토스트, PC 앱 저장소, 슬라이더 10 단위[^spec]
- 개발용 모의 패널에 [전체 주문 삭제] 추가 (2026-11-19 사용자 요청)[^spec]
- D. 크기 배율: 2.5배는 스피커 한계를 넘어 80~100이 같게 들려 20 = 절반 · 40 = 지금 · 100 = 2배로 고르게 (사용자)[^spec]
- E. 미리보기에서 끈 상태 예시에 「위젯에 표시 안 함」 (사용자)[^spec]

# 남은 일 / 위험
- 80 → 90 → 100의 소리 차이가 계산상 약 0.8 · 0.5dB로 작다. 실제로 들어 보고 모자라면 곡선을 다시 맞춘다
- 깨진 설정 값은 기본값으로 쓰지만 다시 저장하지는 않는다(다음에 바꿀 때 저장됨)
- 전체 삭제 직후 늦게 온 응답이 주문을 되살릴 수 있다 (개발용, 드묾)
- 실제 소리 파일 교체 · 알림음 종류 추가는 범위 밖

# 히스토리
- 2026-11-19T12:25+09:00 스펙 승인 · 커밋 `c3a1dff`, 지휘 세션이 Orca로 작업 세션을 Sonnet 5.5로 열고 지시서 전달
- 2026-11-19T12:26+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인, 시작
- 2026-11-19T12:36+09:00 작업 세션 보고: 구현 · ① · ② · ③, 질문 A(80~100 같게 들림) · B(미리보기와 표시 상태) → 지휘 세션 ① 직접 재실행 통과(552개 · Rust 35개)
- 2026-11-19T12:38+09:00 사용자 답: A-2(20 절반 · 40 지금 · 100 두 배), B-2(「위젯에 표시 안 함」) → 작업 세션 반영, ② 가벼운 리뷰, 지휘 세션 ① 재확인(554개)
- 2026-11-19T12:44+09:00 스펙 결정 D · E main 커밋 `4943fd8`, 사용자 "권장"(A-1, B-1) → 커밋 · 머지

[^spec]: SPEC-settings-widget.md
