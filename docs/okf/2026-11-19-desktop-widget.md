---
type: Task Report
title: T06. 바탕화면 주문 알림 위젯 · 알림음
description: 프로그램 창이 뒤에 있어도 새 주문을 놓치지 않게 바탕화면 위젯과 30초 반복 알림음으로 알리고, 위젯에서 바로 처리한다.
tags: [desktop-widget, sound, tauri-window]
status: stable
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-19T11:04:00+09:00
sources:
  - id: spec
    resource: /docs/specs/SPEC-desktop-widget.md
    title: 스펙 — 바탕화면 주문 알림 위젯 · 알림음 (2026-11-19 승인, 11장 G~J 구현 중 결정)
  - id: answers
    resource: /docs/tasks/planner-answers.md
    title: 기획자 답변 Q20 · Q30 · Q31 · Q32 · Q33 · Q44 · Q54
  - id: task
    resource: plane:WHALEERPPO-7
    title: "[F-WDGPOP] T06. 바탕화면 주문 알림 위젯 · 알림음"
verified:
  - by: human:yjnoh
    at: 2026-11-19T12:14:08+09:00
---

# 목표
프로그램 창이 최소화됐거나 기존 POS 뒤에 있어도 새 주문을 놓치지 않게 위젯과 알림음으로 알리고, 위젯에서 바로 처리한다. 완료 기준은 스펙 7장 1~7[^spec].

# 작업 내용
- 알림음이 실제로 난다(소리 파일 없이 Web Audio로 만듦): 새 주문 「딩동」 두 음, 경고 낮은 음 세 번. 새 주문 때 한 번, 접수대기가 있으면 30초마다 반복(새 주문이 오면 30초를 다시 셈), 모두 처리 · 로그아웃하면 멈춤, 같은 순간 여러 건이면 한 번. 첫 터치 · 키 입력 때 소리 장치를 미리 깨운다
- 위젯 창: 테두리 없음 · 항상 위 · 작업표시줄 숨김 · 초점을 가져가지 않음, 주 모니터 작업 영역 오른쪽 아래 여백 16px, 폭 340px, 높이는 카드에 맞추고 화면을 넘으면 카드 수를 줄여 「+ N건」에 더함. 본 창이 닫히면 위젯도 닫힘
- 본 창이 앞이면 새 주문에 소리만, 최소화 · 다른 창 뒤면 위젯 + 소리. 30초 반복 때 숨긴 위젯 · 닫은 접수대기 카드를 다시 띄움
- 카드: 상태 · 주문시간 | 픽업 예정 · 픽업번호 · 요청사항 1줄 · 메뉴 2줄 + 「+ 외 N개」, 접수대기 먼저 · 오래된 것 위 · 최대 5장 · 「+ N건 더 있음」, 자동 OFF 빨간 안내 카드(Q54)
- 위젯 버튼: [주문접수] · [제조완료] 바로 처리(본 창 카드도 바뀜), [픽업완료]는 카드 안 「완료 취소(05)」 5초, [주문취소]는 본 창을 앞으로 + T05 사유 팝업(이미 처리된 주문이면 「#12 다른 PC에서 이미 처리한 주문입니다.」), 카드 누름은 본 창 첫 탭 + 요약 팝업 → 닫으면 그 카드로 스크롤, 「+ N건」은 본 창 첫 탭. 실패는 카드 안 「#12 …」 3초
- 카드 [×]는 그 카드만(접수대기는 30초 뒤 다시), 머리 [×]는 전체(다음 새 주문 · 30초 때 다시)
- 위젯 ↔ 본 창 연결이 실패하면 3초 간격으로 5번 더 시도하고, 계속 실패하면 위젯에 「본 화면에서 처리해 주세요」
- 개발용 모의 주문 패널에 「5초 뒤 주문 1건 / 3건(같은 순간)」 추가 (운영 빌드에 없음)

# 작업 방법
- 진행: 지휘 세션 `pos-boss` / 작업 세션 `t06-desktop-widget-31`(Orca로 실행, Sonnet 5.5), 워크트리 `~/.whale-smart-pos-worktrees/T06-desktop-widget`, 브랜치 `feature/WHALEERPPO-7-desktop-widget`
- 접근: 위젯 창은 `tauri.conf.json`에 숨긴 채 선언하고(label `widget`), 같은 화면 묶음에서 창 label로 위젯 화면을 고른다. 주문 목록은 본 창이 계속 가지고, 위젯에 보일 내용만 이벤트로 보내고 위젯의 동작을 이벤트로 받아 `changeStatus` · 요약 팝업 · 취소 팝업으로 잇는다(위젯은 서버에 직접 묻지 않음). 보일 카드 · 순서 · 5장 · 뜰지 말지 · 위치는 순수 함수로 두고 시험했다. 위젯에는 고객명 · 연락처를 싣지 않는다. 새 라이브러리 없음
- Tauri 확인: 웹 문서를 직접 열지 못해 설치된 소스(tauri-utils 2.10.3 config.rs · tao 0.37.2 window.rs · @tauri-apps/api 2.12.4 · tauri 2.12.5)로 확인했다. 공식 위치: https://v2.tauri.app/reference/config/#windowconfig , https://v2.tauri.app/reference/javascript/api/namespacewindow/ , https://v2.tauri.app/reference/javascript/api/namespaceevent/ , https://v2.tauri.app/security/capabilities/ , https://docs.rs/tao/0.37.2/tao/window/struct.WindowBuilder.html#method.with_focusable
- 쓴 스킬 · 도구: test-driven-development, superpowers:requesting-code-review, pr-review-toolkit:review-pr (리뷰 서브에이전트는 모두 Opus 5.5)

# 변경 파일
- `src/features/desktop-widget/`: 위젯 화면(`WidgetApp` · `WidgetScreen`), 본 창 쪽 연결(`DesktopWidgetProvider` · `widget-host` · `open-request`), 순수 함수(`widget-logic` · `widget-position`), 주고받는 형식(`widget-protocol`), 재시도(`retry`), 문구, 테스트
- `src/shared/sound/web-audio-player.ts`(+테스트): 실제 소리 재생기. `sound-player.ts`: 30초 상수
- `src/features/order-board/OrderBoardScreen.tsx` · `OrderCard.tsx` · `order-board-logic.ts` · `card-colors.ts`: 위젯 요청 받기(첫 탭 · 요약 팝업 · 카드로 스크롤), 카드 색 공용화
- `src/features/dev-mock/DevMockPanel.tsx`(+테스트): 「5초 뒤 주문」 버튼
- `src/app/App.tsx` · `src/main.tsx`: 위젯 연결, 창 label로 화면 고르기
- `src/shared/log/log-messages.ts`: 위젯 · 소리 로그 문구(단계 이름만)
- `src-tauri/tauri.conf.json`: 위젯 창 선언. `src-tauri/capabilities/default.json`: 본 창 권한 4개(show · unminimize · set-focus · set-always-on-top). `src-tauri/capabilities/widget.json`: 위젯 권한(이벤트 · 창 기본 + show · hide · set-size · set-position · 로그). `src-tauri/src/lib.rs`: 본 창이 없어지면 위젯도 닫음(+테스트)

# 검증
- 지휘 세션이 워크트리에서 직접 실행 (최종 A-2 · B-2 반영 뒤): `pnpm lint` · `pnpm typecheck` · `pnpm format:check` · `pnpm test`(39파일 523개) · `pnpm build` · `cargo fmt --check` · `cargo clippy -q -- -D warnings` · `cargo test`(35개) 통과. 운영 빌드 `dist/`에 모의 패널 문자열 없음
- ② 리뷰(Opus 5.5): 지적 13건 → 고침 11(위젯이 화면을 넘으면 카드가 잘리고 「+ N건」이 안 보임, 위젯 띄우기가 겹치면 빈 위젯, 소리 장치 미리 깨우기, 닫은 카드 기록 정리, 스크롤 오작동, 깜빡임, 권한 최소화, 이중 소리 등) · 주석 1 · 보류 1(결정 I)
- ③ 리뷰(Opus 5.5, code-reviewer · silent-failure-hunter · pr-test-analyzer · comment-analyzer): 고침 — 위젯 카드를 두 번째 누르면 본 창이 무시하던 버그, 위젯 창 닫기 실패 시 프로그램 직접 종료, 본 창 「항상 위」가 남던 문제(반드시 내림), 단계별 로그 문구, 테스트 15개 추가, 틀린 주석 10곳. 보류 — 연결 실패 대처(사용자 결정 A-2로 반영), 이미 처리된 주문 취소 안내(B-2로 반영), 주 모니터를 못 읽을 때 대체 등 영향 작은 것
- A-2 · B-2 반영 뒤 ② 가벼운 리뷰(Opus 5.5): 지적 6건 → 고침 5(재로그인 때 연결 실패 표시가 남던 것, 화면 받기 포기 뒤 위젯을 닫을 방법이 없던 것 → 위젯 [×]로 접음, 동기 오류를 실패로 세기, 안내 줄로 높이가 늘 때 카드 수 다시 맞추기, 경합 테스트) · 그대로 1(순서 단언 — 결과가 같음)
- Linux 실제 창 (사용자, 머지 뒤, 2026-11-19): KDE Wayland에서는 위젯이 오른쪽 아래에 보이지 않았다(Wayland는 앱이 창 위치 · 항상 위를 정하지 못하게 함, 로그에 위젯 오류 없음). `GDK_BACKEND=x11`로 다시 켜서 확인 순서 1~8대로 확인, 정상. 소리는 사용자가 더 커야 한다고 판단(아래 결정 K)
- Windows 수동 체크리스트 (사용자, 미확인):
  1. 기존 POS(전체 화면)가 앞일 때 위젯이 그 위에 뜨는가
  2. POS 입력칸에 금액을 치는 중 위젯이 떠도 입력이 POS로 계속 들어가는가 (문서로 확정 못 함, 꼭 확인)
  3. 위젯 버튼을 터치하면 눌리고, POS 초점은 안 옮겨지는가
  4. 작업표시줄 위 여백 16px, 작업표시줄에 따로 안 보임, 화면 배율 125% · 150%, 1024×768에서 카드가 잘리지 않고 「+ N건」으로 세어지는가
  5. 위젯 카드 · 「+ N건」 · [주문취소]로 본 창이 앞으로 오는가(작업표시줄만 깜빡이면 실패), 본 창이 항상 위로 남지 않는가
  6. 자동 로그인 재시작 뒤 화면을 한 번도 안 누른 채 주문이 와도 소리가 나는가 (WebView2 자동재생 정책, 확정 못 함)
  7. 본 창을 10분 넘게 최소화해 둬도 30초마다 소리가 나는가 (WebView2 절전, 확정 못 함)
  8. 매장 스피커에서 「딩동」과 경고음이 충분히 크고 서로 구분되는가
  9. 종료 · 재시작 때 위젯 창이 남지 않는가

# 결정 사항
- 승인 때 (2026-11-19 사용자, 모두 권장안): 소리는 코드로 만듦, 크기 100%, 보일 상태 기본 접수대기 · 제조중 · 제조완료, 본 창이 앞으로 와도 위젯 유지, 주 모니터 오른쪽 아래, 위젯 버튼 실패는 카드 안 3초 문구[^spec]
- 스펙에 빠져 있던 자동 OFF 안내 카드(Q54)는 Plane 본문 · 기획자 답변대로 승인 때 스펙에 넣었다[^spec]
- G. 위젯 ↔ 본 창 연결 실패: 3초 간격 5번 더 재시도, 계속 실패하면 「본 화면에서 처리해 주세요」 (사용자)[^spec]
- H. 위젯 [주문취소] 때 이미 처리된 주문이면 본 창 + 「#12 다른 PC에서 이미 처리한 주문입니다.」 (사용자)[^spec]
- I. 본 창 요약 팝업이 열린 같은 주문을 위젯에서 취소하면 「다른 PC」 안내가 잘못 뜨는 것은 이번엔 안 고침 (사용자, 드묾)[^spec]
- K. 소리 크기: 지금 소리를 크기 설정 40으로 보고, 설정에서 100까지 키울 수 있게 한다. 크기 설정은 T10에서 만든다 (사용자, 2026-11-19)[^spec]
- J. 소리 파형 최대 크기 0.5(두 음이 겹쳐도 찢어지지 않게), 실제로 들어 보고 정함 (사용자)[^spec]

# 남은 일 / 위험
- 위젯 설정 화면(표시 상태 · 위치 · 크기 슬라이더 · 미리듣기, T10), 출력 실패 경고음 호출(T12)
- Windows에서 초점 안 빼앗기 · 자동재생 · 최소화 중 30초 타이머는 문서로 확정 못 해 실물 확인이 필요하다 (체크리스트 2 · 6 · 7)
- 결정 I의 잘못된 안내 (드묾)
- 위젯 연결 실패 안내는 일부러 만들 방법이 없어 테스트로만 확인했다
- 주 모니터를 못 읽을 때의 대체 위치는 없다 (로그만)
- Linux Wayland에서는 위젯 위치 · 항상 위가 무시된다. 배포 대상(Windows)과 무관하고, 리눅스 개발 PC에서 볼 때는 `GDK_BACKEND=x11 pnpm tauri dev`로 켠다
- 앱이 켜질 때 "Couldn't find callback id" 경고가 찍힌다(개발 모드에서 화면을 다시 불러올 때 생김). 동작에는 문제가 없었다

# 히스토리
- 2026-11-19T11:04+09:00 스펙 승인 · 커밋 `a6261e7`, 지휘 세션이 Orca로 작업 세션을 Sonnet 5.5로 열고 지시서 전달
- 2026-11-19T11:04+09:00 작업 세션 회신: 모델 Sonnet 5.5 (claude-sonnet-5-5) 확인, Tauri 문서 확인부터 시작
- 2026-11-19T11:50+09:00 작업 세션 보고: 구현 · ① · ② 13건(고침 11) · ③(버그 1건 포함 다수 고침), 질문 A~C → 지휘 세션 ① 직접 재실행 통과(512개 · Rust 35개). 소리 크기가 결정 B(100%)와 달리 파형 0.5인 것을 사용자에게 알림(D)
- 2026-11-19T11:55+09:00 사용자 답: A-2(연결 실패 재시도 + 안내), B-2(이미 처리 토스트), C-1, D-1(0.5 유지) → 작업 세션 반영, ② 가벼운 리뷰 6건(고침 5), 지휘 세션 ① 재확인(523개)
- 2026-11-19T12:04+09:00 스펙 결정 G~J main 커밋 `6146f89`, 사용자 "권장으로"(A-1, B-1) → 커밋 · 머지
- 2026-11-19T12:14+09:00 머지 `84a13dd`, main에서 ① 통과(523개 · Rust 35개). Wayland에서 위젯 위치 문제 → X11로 다시 켜 사용자 확인 정상, 사용자 "A-1"로 OKF 승인(stable). 소리 크기는 "지금을 40으로, 100까지" → T10으로 넘김

[^spec]: SPEC-desktop-widget.md
