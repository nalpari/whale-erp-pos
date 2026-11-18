# whale-smart-order: 매장 주문접수 프로그램

> 이 문서는 AI 코딩 에이전트(Claude Code, Codex, Cursor, Gemini 등) 공용 규칙이다. 도구별 추가 규칙은 각 도구의 설정 파일(예: `CLAUDE.md`)에 둔다.

## 프로젝트 한 줄 요약

고객 앱에서 **결제가 끝난 주문**을 매장 POS PC(Windows)에서 받아
**알림 → 접수/거부 → 주문서 출력 → 제조 완료 → 픽업 완료**까지 처리하는 설치형 프로그램.
기획서상 이름은 **"픽업오더 주문접수"**(웨일 ERP · 파트너오피스 연계)다.
대표님 프랜차이즈 매장에서 먼저 실사용(파일럿)하고, 이후 가맹점으로 확장한다.

- **개발 인원**: 1명 (이 저장소 담당자)
- **마감**: 2027년 2월 파일럿 매장 실사용
- **현재 단계**: 개발 중. T00 골격 · T01 프로그램 틀 · T02 로그인 (2026-11-16), T11 프린터설정 · T14 공통 로그 (2026-11-17) 완료. 모두 모의 서버 기준. 기획자 답변(2026-11-18)으로 T01 · T02 · T11을 다시 연다
  - **화면 기준**: 화면정의서 v0.8(`docs/references/pickup-order-screen-spec-v0.8-260717.pdf`). 화면 구성은 이 문서를 그대로 따른다. v0.8이라 내용이 더해질 수 있다.
  - 진행 상황 (2026-11-18 기준): 리서치 완료. 대표님 질문지(`docs/questions/`)와 백엔드 협의 문서 3종(`docs/requests/`, `docs/proposals/`)은 초안 작성까지 끝났고, 답변·협의 결과를 기다리는 중이다. 화면정의서 v0.8을 받아 태스크 13개와 기획자 문의 52개로 정리했다(`docs/tasks/`). 기술 스택을 확정하고 T00 · T01 · T02 · T11을 구현해 `main`에 머지했다(보고서 `docs/okf/`). T02 자동 로그인과 T11 화면은 Linux 실제 창에서 확인했다. Linux에서 만든 Windows 설치 파일(`-setup.exe`)로 Windows PC에서 화면이 나오는 것을 확인했다(2026-11-17). 입력 방식은 터치스크린 우선으로 정했다. 사무실 테스트 프린터는 SEWOO SLK-TS100이다(`docs/research/test-printer-slk-ts100.md`). 공통 로그(T14)를 넣었다. 기획자 문의 54개의 답을 모두 받았다(2026-11-18, `docs/tasks/planner-answers.md`).
  - 남은 확인: Windows PC에서 T00 Windows 직접 빌드 · 한글 앱 이름, T01 체크리스트 14개, T02 체크리스트 8개, T11 체크리스트 10개 (각 OKF 보고서). T11은 프린터 커넥터를 산 뒤 확인한다.
  - 다음 할 일: 기획자 답변으로 바뀐 T02 로그인 · T11 프린터설정 · T01 프로그램 틀을 다시 열어 고친다 (바꿀 것은 `docs/tasks/README.md`의 "기획자 답변 반영 (2026-11-18)"). 그다음 주문 처리(T03~T07)를 모의 서버로 시작한다. 실제 API 형태는 백엔드 PL 회의 뒤에 정한다.

## 범위

**만드는 것**
- POS PC에 설치하는 Windows 프로그램 (기존 POS와 별개로 실행)
- 로그인: 점포번호 계정(점포코드 + 매장 프로그램 비밀번호, 자동 로그인)과 웨일ERP 계정(아이디 + 비밀번호 + 점포코드). PC 한 대가 점포 하나를 맡고, 로그인한 점포의 주문만 표시 (기획자 Q09)
- 주문받기 ON/OFF (헤더). 픽업 상태(여유 · 보통 · 혼잡)는 Lite 범위에서 뺐다 (기획자 Q02)
- 백엔드에서 주문 실시간 수신(방식은 협의 중), 재연결 시 놓친 주문 다시 받기
- 주문 상태 변경을 백엔드 API로 회신
- 주문서·영수증 프린터 출력 (프린터 최대 3대)
- 바탕화면 주문 알림 위젯과 알림음
- 주문내역 조회 (오늘·어제·이번 달·최근 한 달, 결제정보 포함. 기획자 Q34)
- 매장정보 편집, 메뉴품절 설정, AI챗봇 인기메뉴 설정 (고객 앱에 보이는 값을 고치는 화면만)
- 자동 업데이트

**만들지 않는 것**: 범위를 넓히기 전에 반드시 사용자에게 먼저 묻는다
- 고객 앱, 결제·환불, 고객 알림 발송 → 앱 팀 / 백엔드 팀 담당
- 백엔드 API 서버 → 백엔드 팀 담당 (요청 문서: `docs/requests/backend-api-request.md`)
- 기존 POS 프로그램과의 연동
- KDS, 픽업 호출 모니터(DID), 컵 라벨, 재고/BOM, 정산, 본사 관리 화면, 배달앱 연동
- AI 챗봇 자체, 한 달보다 이전 주문내역 조회(웨일ERP 담당, 기획자 Q34)

## 미결정 사항 (추측해서 정하지 말 것)

| 항목 | 상태 | 영향 |
|---|---|---|
| 프린터 모델·연결 방식, 전용 프린터 여부 | 대표님 확인 대기. 화면정의서는 Windows 드라이버로 설치된 프린터를 목록에서 고르는 방식을 전제한다(p.19). 출력 실패 처리는 기획자가 정했다(Q47: 접수는 그대로, 경고음 · 빨간 띠 · 「미출력」 꼬리표) | 출력 방식 (드라이버 vs 포트 직접) |
| 주문 실시간 전달 방식 (WebSocket / SSE / 롱 폴링 / 짧은 폴링 / MQTT)과 서버 측 담당 | 백엔드 PL 회의 대기 (`docs/proposals/realtime-delivery-options.md`) | 수신 모듈 (화면은 무관) |
| 백엔드 API 형태 (엔드포인트, 상태명) | 백엔드 팀 협의 전. 화면정의서로 요청 범위가 늘었다(`docs/requests/backend-api-request.md` 7장) | 통신 계층 |

위 항목에 기대는 작업을 할 때는 **가정임을 명시**하고, 확정되면 이 표를 갱신한다.

## 확정 사항

| 항목 | 결정 | 결정일 | 비고 |
|---|---|---|---|
| Windows 7 지원 | **지원하지 않는다.** Windows 10 이상만 지원 | 2026-11-16 (담당자) | 파일럿 매장 PC의 실제 Windows 버전은 아직 확인하지 못했다. Windows 7이면 PC 교체가 필요하다 (`docs/questions/ceo-store-environment.md` Q1, Q2) |
| 기술 스택 | **Tauri v2 (Rust) + Vite + React** | 2026-11-16 (담당자) | Next.js는 쓰지 않는다. 화면 내장 방식에서는 서버 기능을 쓸 수 없어 Vite가 더 단순하다 |
| 화면 배포 방식 | **화면 내장(A-2).** 화면 파일을 설치 파일에 넣고, 수정은 Tauri 자동 업데이트로 배포 | 2026-11-16 (담당자) | 화면용 웹 서버를 두지 않는다. 비교 근거는 `docs/proposals/ui-delivery-options.md`. 매장이 늘어 즉시 반영이 필요해지면 원격 웹(A-1)을 다시 검토한다 |
| 입력 방식 | **터치스크린 우선.** 손가락으로 누르는 것을 기본으로 화면과 버튼을 크게 만들고, 마우스는 보조로 지원한다 | 2026-11-17 (담당자) | 파일럿 매장 PC가 실제로 터치스크린인지는 아직 확인하지 못했다. 버튼 크기는 화면정의서를 따르고, 손가락으로 누르기에 작아 보이는 버튼은 기획자에게 묻는다. 이미 만든 T01 · T02 화면은 Windows 터치 테스트에서 문제가 나온 곳만 고친다 |
| 기획자 답변 | **54개 모두 확정으로 본다.** "(제안)"으로 시작하는 답도 구현 기준으로 쓴다 | 2026-11-18 (담당자) | 원문 `docs/tasks/planner-answers.md`. 화면정의서와 다르면 답변을 따른다. 이미 머지한 태스크는 원래 Plane 작업 항목을 다시 열어 고친다 |

## 문서 위치

| 경로 | 내용 | 신뢰도 |
|---|---|---|
| `docs/research/coffee-smart-order-admin-system.md` | 업계 전반 리서치 | **참고용.** 범위가 이 프로젝트보다 훨씬 넓고, 출처 없는 수치와 부정확한 기술 설명(ESC/POS 명령, 2PC 등)이 있음. 설계 근거로 직접 인용하지 말 것 |
| `docs/research/store-order-receiver-tech-research.md` | 이 프로젝트 범위 기술 리서치 (Win 버전 지원, Tauri v2, Next.js 정적 내보내기, 프린터 출력, 실시간 전달, 코드 서명) | 1차 출처 기반, 주장마다 출처 링크. "확인 불가" 항목은 근거로 쓰지 말 것 (2026-11-12 기준) |
| `docs/research/store-order-delivery-industry-practices.md` | 다른 서비스의 매장 주문 전달 방식 조사 (배달의민족 폴링 → MQTT → SSE, 미접수 자동 취소 규칙 등) | 회사가 직접 밝힌 자료만 근거. 매장 단말 구간이 확인된 곳은 배달의민족뿐. `[도구 요약 경유]` 표시 항목은 인용 전 링크 확인 (2026-11-16 기준) |
| `docs/research/test-printer-slk-ts100.md` | 사무실 테스트 프린터 SEWOO SLK-TS100 사양 (연결 단자, ESC/POS, 드라이버) | 한글 매뉴얼(`docs/research/SLK-TS100 USERS MANUAL_KOR.pdf`, Rev.A 04/2025) · 데이터시트(해외판) 기준. **파일럿 매장 프린터 아님.** 한글 출력 · 상태 응답은 미확인 (2026-11-17) |
| `docs/research/research-comparison.md` | 두 리서치 문서 비교, 기존 문서 활용 가이드 | 기존 문서를 볼 때 먼저 확인 |
| `docs/questions/ceo-store-environment.md` | 대표님께 드릴 질문 (매장 환경, Win7, 프린터) | 답변 기록 표 확인. Win7 미지원은 확정(Q7), 파일럿 PC의 실제 버전(Q1)은 아직 필요 |
| `docs/requests/backend-api-request.md` | 백엔드 팀 API 요청 초안 | 협의 전 초안 |
| `docs/proposals/ui-delivery-options.md` | 화면 배포 방식(A-1/A-2) 비교 문서 | **결정됨: A-2 화면 내장 (2026-11-16).** 비교 근거와 A-2의 업데이트 적용 시점(3.1절) 참고용 |
| `docs/proposals/realtime-delivery-options.md` | 주문 실시간 전달 방식 협의 문서 | 협의 전 초안 |
| `docs/reviews/2026-11-16-docs-verification.md` | 위 문서 전체에 대한 검증 보고서 (틀린 곳, 빠진 것, 방향 판단) | [확인]은 공식 문서로 확인한 사실, [판단]은 검증자 의견(출처 없음). 반영 현황은 8장 |
| `docs/meetings/backend-pl-brief.md` | 백엔드 PL 회의 준비 자료 (물을 질문, 담당자 의견, 받아 올 결정) | 담당자 메모. "내 의견" 절은 확정이 아님. 회의 후 6장 기록 칸 확인 |
| `docs/references/pickup-order-screen-spec-v0.8-260717.pdf` | 기획자가 만든 화면정의서 v0.8 (24쪽) | **화면 구성의 기준.** 설명만으로 확정되지 않는 부분은 문의 목록 참고 |
| `docs/tasks/README.md` | 화면정의서 기준 태스크 13개(T01~T13), 권장 순서, 기존 문서와 달라진 점 | 스펙 전 단계의 할 일 정리. "가정" 표시 항목은 확정 아님 |
| `docs/tasks/planner-answers.md` | 기획자 답변 54개 원문 (2026-11-18 받음) | **화면 동작의 기준.** "(제안)" 답도 확정으로 본다 (2026-11-18 담당자 결정). 화면정의서와 다르면 이 답변을 따른다 |
| `docs/tasks/planner-questions.md` | 기획자 문의 54개 (처음 보낸 52개 + 2026-11-17 추가 2개) | 질문 원문. 답변은 `docs/tasks/planner-answers.md` (기획자 아티팩트 https://claude.ai/artifact/CeRKJfncV9gJH8LJYzLvrY 에서 2026-11-18 복사해 옴. 아티팩트 답변 DB는 Claude Code에서 읽을 수 없다) |
| `docs/presentations/` | 대표님·백엔드 팀 발표 자료 | 화면정의서를 받기 전에 만든 초안 |
| `docs/specs/` | 태스크별 스펙 (`README.md`가 목록). 구현 계획은 `docs/plans/` | 상태가 "승인"인 것만 구현 기준 |

## 핵심 설계 원칙

1. **주문 누락 0건이 최우선이다.** 실시간 수신만 믿지 않는다. 재연결·재시작 시 미확인 주문을 조회하고, 주문마다 수신 확인(ack)을 보낸다.
2. **중복 처리 방지.** 같은 주문·이벤트가 두 번 와도 한 번만 알리고 한 번만 출력한다 (`orderId`/`eventId` 기준). 상태 변경 요청에는 멱등키를 붙인다.
3. **피크타임 기준으로 생각한다.** 출근·점심 시간에 주문이 몰려도 화면·알림·출력이 밀리지 않아야 한다.
4. **점원은 바쁘다.** 화면은 배달앱 주문접수 프로그램처럼 익숙하고 단순하게. 큰 글씨, 적은 클릭, 확실한 알림음.
5. **매장 PC는 며칠씩 켜져 있다.** 메모리 누수, 토큰 만료, 연결 끊김 후 복구를 고려한다.

## 작업 방식

- **요청이 애매하거나 궁금한 점이 생기면 추측하지 말고 반드시 먼저 묻는다.**
  - 요청을 두 가지 이상으로 해석할 수 있거나, 작업에 필요한 정보(대상, 범위, 동작, 기준값 등)가 빠져 있으면 작업을 시작하기 전에 질문한다.
  - 작업 도중에 새로 생긴 의문도 마찬가지다. 그럴듯한 값을 임의로 채워 넣고 진행하지 않는다.
  - 질문할 때는 무엇이 애매한지와 가능한 선택지를 함께 제시한다.
  - **질문·확인 항목 표기 형식**: 사용자에게 확인받을 항목은 알파벳(A, B, C …)으로 번호를 붙이고, 각 항목의 보기는 숫자(1, 2, 3 …)로 제시한다. 사용자가 "A-2, B-1"처럼 답할 수 있게 한다.
    ```
    A. 실시간 연결 방식은?
       1. WebSocket (권장)
       2. SSE
    B. 주문서 출력 시점은?
       1. 접수 버튼을 누를 때
       2. 주문이 들어오자마자
    ```
  - 저장소 코드·문서를 확인해서 답할 수 있는 것은 먼저 확인하고, 그래도 모르는 것만 묻는다.
  - **작업 세션도 같은 규칙을 따른다.** 작업 세션은 애매한 점을 만나면 임의로 정하지 말고 작업을 멈춘 뒤, 무엇이 애매한지와 선택지를 지휘 세션에 보고한다. 지휘 세션은 이를 사용자에게 묻고, 답을 받아 작업 세션에 다시 맡긴다. 작업을 넘길 때 이 규칙을 지시서에 넣는다.
- **기능 구현을 마쳐도 바로 git commit · push · merge 하지 않는다.**
  - 구현과 검증(테스트·빌드)이 끝나면 작업을 멈추고, 변경 내용을 요약해 사용자에게 리뷰를 요청한다. 리뷰는 아래 "리뷰 · QA" 절차를 따른다.
  - 사용자가 리뷰 결과를 확인하고 명시적으로 요청한 경우에만 commit · push · merge 한다. 이전에 받은 승인은 다음 작업에 적용하지 않는다.
  - 작업 세션도 commit · push · merge 하지 않는다. 작업을 넘길 때 이 규칙을 지시서에 넣는다.
- **태스크 = 개발 작업의 기능 단위.** Plane을 쓰면 기능마다 작업 항목(work item) 하나로 나누고, 그 작업 항목을 태스크로 본다. 규칙·문서 수정, 리서치, 협의 문서 작성은 태스크가 아니다.
- **태스크를 하나 마칠 때마다 OKF 작업 보고서를 작성한다.** 태스크가 아닌 작업에는 쓰지 않는다. (아래 "OKF 작업 보고서" 참고)
- **응답과 문서는 한국어**로 작성한다. 코드 식별자와 커밋 type 접두는 영어.
- **사용자와의 대화는 친구처럼 반말**로 한다. 문서(`docs/` 아래, 대표님·다른 팀 전달 문서, OKF 보고서)와 커밋 메시지는 지금 문체를 그대로 쓴다.
- **`i-have-adhd` 스킬을 항상 켜 둔다.** 세션을 시작하면 `~/.agents/skills/i-have-adhd/SKILL.md`를 읽고, 그 규칙(다음 할 일을 맨 앞에, 여러 단계는 번호 목록, 매 턴 진행 상태 다시 알리기, 곁가지 줄이기, 구체적인 소요 시간)을 모든 응답에 적용한다. 사용자가 "stop adhd mode" 또는 "normal mode"라고 하기 전까지 유지한다. 위의 질문 형식(A/B + 1/2)과 리뷰 절차가 이 스킬보다 우선한다.
- 사용자는 POS·프린터 등 하드웨어 영역에 익숙하지 않을 수 있다. 기술 개념은 비유와 함께 쉽게 설명하고, 결정이 필요하면 선택지와 장단점을 표로 제시한다.
- 대표님·다른 팀에 전달할 문서는 개발 용어를 줄이고 "왜 중요한가"를 붙인다.
- 외부 사실(지원 종료 시점, 라이브러리 버전, 프린터 명령어)은 공식 문서로 확인한 뒤 쓴다. 확인하지 못했으면 그렇다고 표시한다.
- **개발은 싱글 콘솔 오케스트레이션으로 한다 (2026-11-16 확정).** 아래 "싱글 콘솔 오케스트레이션" 절을 따른다.
- 개발 단계 스킬(agent-skills)은 이 순서로 쓴다: `interview-me` → `spec-driven-development` → `planning-and-task-breakdown` → `incremental-implementation` + `test-driven-development` → 리뷰는 "리뷰 · QA (회사 방침)" 순서를 따른다

## 싱글 콘솔 오케스트레이션 (2026-11-16 확정)

사용자는 **지휘 세션 하나**에서 명령 · 승인 · "커밋해"만 한다. 구현과 ①~③ 검증 · 리뷰는 태스크마다 따로 연 **작업 세션**이 한다.

| 세션 | 이름 | 하는 일 |
|---|---|---|
| 지휘 세션 | `pos-boss` | 계획 · 워크트리 만들기 · 지시서 보내기 · 결과 확인 · OKF 보고서 · 커밋 · Plane · 문서. **코드를 직접 고치지 않는다** (워크트리 안에서는 `docs/okf/`만 쓴다) |
| 작업 세션 | `pos-T<번호>` (예: `pos-T00`) | 태스크 하나의 구현, ① 자체 검증, ② · ③ 리뷰와 지적 고치기 |

### 순서

1. **계획 승인**: 지휘 세션이 태스크의 계획(바꿀 파일, 완료 기준, 정해지지 않은 것)을 보이고 사용자 승인을 받는다.
2. **워크트리**: 지휘 세션이 태스크마다 워크트리 하나를 만든다.
   - 위치: `~/.whale-smart-pos-worktrees/T<번호>-<짧은-영어-이름>` (예: `T00-project-skeleton`)
   - 브랜치: "개발 규칙 > 브랜치"의 이름 규칙. `main`에서 만든다.
   - 만들기 전에 같은 이름의 폴더 · 브랜치 · 세션이 없는지 확인한다.
3. **세션 열기**: 사용자가 그 워크트리에서 Claude Code를 **Sonnet 5.5로** 켜고(`claude --model claude-sonnet-5-5`) `/rename pos-T<번호>`로 이름을 붙인 뒤 지휘 세션에 알린다. 지휘 세션은 세션을 직접 열지 못한다 ("모델 사용 규칙" 참고).
4. **지시서 보내기**: 지휘 세션이 작업 세션 목록에서 이름을 확인한 뒤 지시서를 보낸다. 같은 이름이 둘이거나 없으면 사용자에게 묻는다. 이때 워크트리에 OKF 보고서 초안을 만들고 히스토리 첫 줄을 적는다.
5. **구현 · 검증 · 리뷰**: 작업 세션이 구현하고 ① → ② → ③을 순서대로 한다. 지적은 작업 세션이 고친다.
6. **확인**: 작업 세션이 보고하면 지휘 세션이 워크트리의 diff와 명령 결과를 직접 확인한다. 보고를 그대로 믿지 않는다.
7. **보고 · 커밋**: 지휘 세션이 사용자에게 결과를 보고하고, OKF 보고서를 쓴다. 사용자가 "커밋해"라고 하면 지휘 세션이 그 워크트리에서 `/ip-commit-push` 규칙대로 커밋한다.
8. **정리 (지휘 세션이 한다, 2026-11-16 사용자 결정)**: `main`에 머지되고 사용자가 OKF를 승인하면, 지휘 세션이 작업 세션을 닫고 워크트리와 브랜치를 지운다. 사용자에게 따로 묻지 않는다.
   1. 확인: 워크트리에 고친 파일이 없고(`git status --porcelain`이 빈 값), 브랜치가 `main`에 머지됐고(`git branch --merged main`), 작업 세션이 쉬는 중(idle)인지 본다. 하나라도 아니면 멈추고 사용자에게 알린다.
   2. 작업 세션 닫기: 그 세션의 Claude Code 프로세스(작업 폴더가 그 워크트리인 프로세스)를 찾아 정상 종료 신호(SIGTERM)를 보낸다. 터미널 창은 남고 Claude만 끝난다.
   3. `git worktree remove <워크트리>` → `git branch -d <브랜치>` (`-D`로 강제 삭제하지 않는다).

### 지시서에 반드시 넣을 것

1. 답변은 한국어로. 이 문서(`AGENTS.md`)를 먼저 읽는다.
2. 커밋 · 푸시 · 머지는 하지 않는다 (지휘 세션이 "커밋해" 뒤에 한다).
3. 자기 워크트리 밖의 파일을 고치지 않는다. 워크트리 안의 `docs/okf/`는 지휘 세션이 쓰므로 고치지 않는다.
4. 정해지지 않은 것은 만들지 말고 멈춰서 선택지와 함께 보고한다.
5. 새 라이브러리를 추가하기 전에 보고하고 기다린다.
6. 태스크 목표, Plane 번호, 관련 스펙 · 태스크 문서 경로, 완료 기준.
7. 지시서를 받으면 자기 모델 이름을 회신한다. ② · ③ 리뷰의 서브에이전트는 Opus 5.5(Agent 도구의 `model: "opus"`)로 돌린다 ("모델 사용 규칙").
8. 끝나면 보고할 것: 완료 기준마다 "됨 · 안 됨(이유)", 바꾼 파일, ① 명령과 결과, ② · ③ 지적 건수와 처리("지적 N건 → 고침 N · 보류 N(이유)")와 리뷰에 쓴 모델.

### 모델 사용 규칙 (2026-11-17 사용자 결정)

| 일 | 모델 | 방법 |
|---|---|---|
| 구현 · ① 자체 검증 | **Sonnet 5.5** | 작업 세션을 `claude --model claude-sonnet-5-5`로 켠다. 이미 켰으면 `/model`로 바꾼다 |
| ② · ③ 리뷰 | **Opus 5.5** | 작업 세션이 리뷰 스킬을 부를 때, 리뷰를 맡는 서브에이전트를 Agent 도구의 `model: "opus"`로 띄운다. ①~③을 구현한 세션에서 한다는 규칙은 그대로다 |
| 지휘 세션 (`pos-boss`) | Opus 5.5 | 계획 · 확인 · 문서 |

- 지휘 세션은 지시서 회신에서 작업 세션의 모델을 확인하고, Sonnet 5.5가 아니면 사용자에게 알린다.
- 리뷰 스킬이 서브에이전트 모델을 지정할 수 없는 경우가 있으면 작업 세션은 멈추고 보고한다 (임의로 Sonnet으로 리뷰하지 않는다).

### 사용자에게 보이게 하기

- 사용자는 작업 세션 안을 보지 않는다. 지휘 세션은 지시서를 보낼 때와 보고를 받을 때마다 `[T<번호>]` 이정표와 함께 한두 줄로 알린다.
- 서로 의존하지 않는 태스크는 작업 세션을 여러 개 열어 동시에 진행할 수 있다.

## 리뷰 · QA (회사 방침)

리뷰는 아래 순서를 따른다. 단계를 건너뛰거나 순서를 바꾸지 않는다.

> **2026-11-16 사용자 결정: 지금은 로컬에서 ①~③까지만 한다.** 원격 저장소가 없어 PR 단계(④, ⑤)는 하지 않는다. 나중에 GitHub Actions의 PR 봇이 PR 리뷰를 맡을 예정이며, 그때 ④, ⑤를 어떻게 할지 다시 정한다.

| 단계 | 시점 | 실행 | 대상 |
|---|---|---|---|
| ① 자체 검증 (**리뷰 아님, 반드시 선행**) | 구현 직후 | lint / 타입 검사 / build / 로컬 API 실동작 테스트 | 작업 중인 코드 |
| ② 커밋 전 리뷰 | 커밋 전, **작업 단위마다** | `superpowers:requesting-code-review` | 커밋하지 않은 변경 |
| ③ PR 전 리뷰 | PR 올리기 직전 | `pr-review-toolkit:review-pr` | 로컬 diff |
| — PR 생성 | | **base 브랜치: `main`** (2026-11-16 변경, 아래 "개발 규칙 > 브랜치") | |
| ④ PR 리뷰 (보류) | PR 생성 직후 **1회** | `code-review:code-review` → GitHub Actions PR 봇으로 바꿀 예정 | PR |
| — 코드 동결 | ④ 지적 사항 반영 후 | 이후 코드 변경 금지 (변경이 필요하면 사용자에게 먼저 묻는다) | |
| ⑤ 최종 게이트 (보류) | 머지 요청 직전 | `ip-code-review-claude` | PR |

- ①이 통과하지 않으면 ②로 넘어가지 않는다. ①의 구체적인 명령어는 기술 스택이 확정되면 "기술 스택 / 명령어"에 적는다.
- **①, ②, ③은 구현한 세션에서** 실행한다. **④, ⑤는 구현한 세션이 아닌 별도 세션**에서 실행한다. ④, ⑤를 요청할 때 구현 세션은 리뷰어 세션이 바로 쓸 수 있도록 **리뷰 대상(diff 범위·커밋·PR), 관련 스펙 구간, OKF 작업 보고서 경로, 완료 기준**을 정리해 사용자에게 전달한다.
- 각 단계의 commit · push · PR 생성 · merge는 사용자가 명시적으로 요청한 경우에만 한다.
- 리뷰 지적 사항을 반영하면 OKF 작업 보고서 본문에 단계 번호와 함께 무엇을 고쳤는지 덧붙인다.
- 스킬 이름은 Claude Code 기준이다. 다른 도구는 같은 관점의 리뷰로 대체하되, 단계와 순서는 지킨다.
- **QA는 에이전트가 수행한다.** 단, 실물 하드웨어 확인(프린터 출력물의 한글·줄바꿈·커팅, 알림음 크기 등)은 에이전트가 판단할 수 없으므로, 확인할 항목을 체크리스트로 만들어 사용자에게 요청한다. 에이전트는 가상 프린터·모의 서버로 검증 가능한 범위까지만 "통과"로 보고한다.

## 기술 스택 / 명령어

- **스택 (2026-11-16 확정)**: Tauri v2 (Rust) + Vite + React. 화면은 설치 파일에 내장한다.
- 지원 OS: Windows 10 이상.
- 프로젝트 골격: T00(WHALEERPPO-1)에서 `create-tauri-app` 4.7.5의 `react-ts` 템플릿으로 만들었다 (2026-11-16).
- 패키지 매니저: **pnpm** (12.10.1에서 확인). Node 22.12 이상의 22.x, 24.x, 26 이상 (Vitest 5.1.0의 `engines`가 `^22.12.0 || ^24.0.0 || >=26.0.0`이라 23.x · 25.x는 지원하지 않는다. 개발 PC는 v24.21.0).
- 앱 이름(productName): `픽업오더 주문접수`. 식별자(identifier): `com.whale.pickuporder.dev` (**임시값**. 바꾸면 앱 데이터 폴더가 달라진다).

### 주요 버전 (2026-11-16 설치 기준)

| 영역 | 패키지 | 버전 |
|---|---|---|
| 데스크톱 | Tauri (Rust crate `tauri`, `@tauri-apps/cli`, `@tauri-apps/api`) | crate 2.12.5 · CLI/API 2.12.4 |
| 화면 | React · React DOM | 19.3.1 |
| 빌드 | Vite · `@vitejs/plugin-react` | 8.3.8 · 6.3.0 |
| 언어 | TypeScript | 6.0.3 (`~6.0.3`로 고정. typescript-eslint 8.72.2의 peer 조건이 `>=4.8.4 <6.1.0`이라 6.1 이상(7.x 포함)은 쓰지 않는다. `^`로 바꾸지 말 것) |
| 스타일 | Tailwind CSS · `@tailwindcss/vite` | 4.3.5 |
| 테스트 | Vitest · jsdom · React Testing Library · jest-dom | 5.1.0 · 31.0.1 · 16.3.3 · 7.0.1 |
| 검사 | ESLint · typescript-eslint · Prettier | 10.15.0 · 8.72.2 · 3.10.1 |
| Rust | rustup stable 툴체인의 rustc · cargo | 1.100.0 (개발 PC, rustup 1.29.3). **버전을 고정하지 않는다**: `rust-toolchain` 파일 없이 rustup의 최신 stable을 쓴다 (2026-11-16 사용자 결정) |

### 명령어

| 명령 | 하는 일 |
|---|---|
| `pnpm install` | 의존성 설치 |
| `pnpm dev` | 화면만 브라우저로 실행 (http://localhost:1420) |
| `pnpm tauri dev` | 데스크톱 앱으로 실행 (Linux는 webkit2gtk 등 시스템 패키지 필요) |
| `pnpm build` | 타입 검사 후 화면 빌드 (`dist/`) |
| `pnpm tauri build` | 설치 파일 빌드. Windows 설치 파일은 Windows PC에서 만든다 |
| `pnpm lint` | ESLint (경고도 실패로 본다: `--max-warnings 0`) |
| `pnpm format` / `pnpm format:check` | Prettier 정리 / 검사 |
| `pnpm typecheck` | TypeScript 타입 검사 (`tsconfig.json`, `tsconfig.node.json`) |
| `pnpm test` | Vitest 한 번 실행 |
| `cd src-tauri && cargo fmt --check` | Rust 서식 검사 |
| `cd src-tauri && cargo clippy -- -D warnings` | Rust 정적 검사 (경고도 실패) |
| `cd src-tauri && cargo test` | Rust 테스트 |

- ① 자체 검증 순서: `pnpm lint` → `pnpm typecheck` → `pnpm format:check` → `pnpm test` → `pnpm build` → Rust 검사 3종.
- Rust 검사 결과 (2026-11-16, Linux 개발 PC, rustc 1.100.0): `cargo check` · `cargo fmt --check` · `cargo clippy -- -D warnings`(경고 0개) · `cargo test`(테스트 0개) 모두 통과. `pnpm tauri dev`로 창 제목과 화면 제목 "픽업오더 주문접수"를 확인했다.
- `any` 금지는 ESLint `@typescript-eslint/no-explicit-any: error`로 막는다.

### 개발 환경 준비 (Linux)

Ubuntu 26.04.1 LTS에서 확인했다 (2026-11-16). 근거: [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) (Linux는 Debian 탭의 명령을 그대로 썼다).

1. 시스템 패키지 설치:
   ```
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libxdo-dev \
     libssl-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev
   ```
2. rustup으로 Rust 설치 (공식 설치 스크립트, 기본 선택):
   ```
   curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
   ```
3. Rust 검사 도구 추가: `rustup component add rustfmt clippy`
4. `which cargo`가 `~/.cargo/bin/cargo`를 가리키는지 확인한다. 배포판 Rust 패키지(`/usr/bin/cargo`, 1.93.1)는 지우지 않고 남겨 두었으므로, rustup 쪽이 먼저 잡혀야 한다. 셸에서 배포판 쪽이 잡히면 `export PATH="$HOME/.cargo/bin:$PATH"`를 앞에 붙인다.
   - 자동 로그인 토큰을 Linux에서는 Secret Service(gnome-keyring)에 저장한다. 데스크톱에 로그인해 키링이 잠금 해제된 상태여야 하고, 잠겨 있으면 `pnpm tauri dev` 시작 때 멈추거나 잠금 해제 창이 뜰 수 있다. SSH처럼 화면 없는 환경에서는 실패할 수 있다 (T02, 2026-11-16).
5. Node(22.12 이상의 22.x · 24.x · 26 이상)와 pnpm을 준비한 뒤 `pnpm install`.

### 개발 환경 준비 (Windows, 미확인)

> 아래는 공식 문서 기준으로 정리한 것이다. **사용자가 Windows PC에서 아직 확인하지 않았다.** 근거: [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

1. Microsoft C++ Build Tools 설치, "Desktop development with C++" 선택
2. WebView2: Windows 10(1803 이상)에는 기본으로 들어 있다
3. Rust: `winget install --id Rustlang.Rustup` 후 `rustup default stable-msvc`
4. Node · pnpm 설치 후 `pnpm install`
5. 설치 파일: `pnpm tauri build` (`.msi`는 Windows에서만 만들 수 있다)
6. 확인할 것: productName이 한글이라 설치 파일 · 실행 파일 · 바로가기 이름도 한글이 된다. 정상 동작하는지 확인이 필요하다.

### 개발 환경 준비 (macOS, 미확인)

> 공식 문서 기준으로 정리했다. **아무도 Mac에서 확인하지 않았다.** 근거: [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

1. 데스크톱 앱만 만들면 Xcode 전체 대신 Xcode Command Line Tools로 된다: `xcode-select --install`
2. Rust: `curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh` 후 `rustup component add rustfmt clippy`
3. Node(22.12 이상의 22.x · 24.x · 26 이상)와 pnpm을 준비한 뒤 `pnpm install`
4. 자동 로그인 토큰은 macOS 키체인에 저장될 것으로 보지만 확인하지 않았다 (`keyring` 크레이트 기본 설정 그대로).
5. Mac은 개발 · 화면 확인용이다. 배포 대상은 Windows뿐이다.

### Windows 설치 파일 만들기

배포 대상은 Windows 10 이상이다. 어느 PC에서 개발하든 **운영 배포용 설치 파일은 Windows에서 만든다** (`.msi`와 코드 서명은 Windows에서만 정식 지원). Linux · macOS에서 만드는 방법은 테스트용 `-setup.exe`(NSIS)를 빨리 만들 때만 쓴다. Tauri도 이 방법을 "실험적", "VM이나 CI가 안 될 때 마지막 수단"이라고 한다. 근거: [Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)

| 빌드하는 PC | 나오는 것 | 명령 | 확인 |
|---|---|---|---|
| Windows | `.msi`, `-setup.exe` | `pnpm tauri build` | 미확인 |
| Linux | `-setup.exe`만, 서명 없음 | 아래 "Linux에서" | **확인 (2026-11-17)** |
| macOS | `-setup.exe`만, 서명 없음 | 아래 "macOS에서" | 미확인 |

**Linux에서** (Ubuntu 26.04.1, cargo-xwin 0.23.1, clang 21.1.8에서 확인. 2026-11-17)

1. `sudo apt install nsis lld llvm clang`. clang은 공식 문서상 선택이지만, 이 프로젝트는 Windows 실행 파일에 아이콘 · 앱 정보를 넣는 `embed-resource`(Tauri 기본)가 `clang-cl`을 찾으므로 **필요하다**.
2. `rustup target add x86_64-pc-windows-msvc`
3. `cargo install --locked cargo-xwin`. 개발 PC에만 설치되는 도구다. 프로젝트 의존성(`Cargo.toml`, `package.json`)에는 들어가지 않고, 운영 배포에는 쓰지 않는다.
4. `pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc`. 처음 빌드할 때 Microsoft Windows SDK를 `~/.cache/cargo-xwin`에 내려받는다.
5. 결과물: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/픽업오더 주문접수_<버전>_x64-setup.exe`
6. 서명이 없어서 Windows에서 실행하면 "Windows의 PC 보호" 경고가 뜬다. "추가 정보" → "실행".

**macOS에서** (공식 문서 기준, 미확인)

1. Homebrew로 `brew install nsis llvm`. 설치 안내대로 `/opt/homebrew/opt/llvm/bin`을 `PATH`에 더한다 (Apple Silicon 기준. Intel Mac 경로는 문서에 없다).
2. 3단계부터는 Linux와 같다. 문서에는 macOS용 clang 단계가 따로 없지만, Linux처럼 `clang-cl`을 못 찾으면 Homebrew llvm의 `clang-cl`이 `PATH`에 있는지 본다.

주의: 지금 앱은 모의 서버(`createMockAuthApi`, `createMockStoreStatusApi`)를 항상 쓴다 (`src/app/App.tsx`). 실제 API로 바꾸기 전 설치 파일은 테스트용이다.

## 개발 규칙 (2026-11-16 확정)

> 사용자와 정한 규칙이다. 바꿀 때는 사용자에게 먼저 묻는다. 도구의 버전과 설정 방법은 프로젝트를 만들 때(T00) 공식 문서로 확인해 "기술 스택 / 명령어"에 적는다.

### 브랜치

- **`main` + 작업 브랜치** 방식이다. `development` 브랜치는 두지 않는다.
- 작업 브랜치는 `main`에서 만들고, 이름은 `feature/WHALEERPPO-<번호>-<짧은-영어-이름>`이다. 버그 수정은 `fix/` 접두를 쓴다. 예: `feature/WHALEERPPO-2-app-shell`
- 코드 변경은 작업 브랜치에서만 한다. 작업 브랜치는 PR로 `main`에 머지한다.
- 원격 저장소는 아직 없다. PR이 필요한 리뷰 ③~⑤는 원격이 정해진 뒤에 할 수 있다.

### 코드 스타일

- **TypeScript**: 엄격 모드(strict). `any`는 쓰지 않는다. 타입을 모르면 `unknown`으로 받고 좁힌다.
- **검사·정리**: 화면은 ESLint + Prettier, Rust는 rustfmt + clippy. 경고를 남긴 채 리뷰 ②로 넘기지 않는다.
- **스타일링**: Tailwind CSS.
- **터치 우선 (2026-11-17)**: 손가락 탭으로 모든 기능을 쓸 수 있어야 한다. 마우스를 올렸을 때(hover)만 보이는 기능, 오른쪽 클릭 · 더블 클릭이 필요한 기능은 만들지 않는다.
- **이름**: React 컴포넌트 파일은 PascalCase, 그 밖의 파일·폴더는 kebab-case. 코드 식별자는 영어.
- **주석**: 한국어. 코드가 "무엇을" 하는지보다 "왜" 그렇게 하는지를 적는다.

### 구조

- Tauri 기본 구조를 따른다: `src/`는 화면(React), `src-tauri/`는 Rust.
- 화면은 기능별 폴더로 나눈다: `src/features/<기능>/` (예: `login`, `order-board`). 여러 기능이 같이 쓰는 것만 `src/shared/`에 둔다.
- 화면 상태 관리 방식(라이브러리)은 스펙 단계에서 주문 수신 구조를 보고 정한다.

### 테스트

- 화면: Vitest + React Testing Library. Rust: `cargo test`.
- `test-driven-development` 순서(실패하는 테스트 → 구현 → 정리)로 진행한다.
- 백엔드 API가 정해지기 전에는 모의 서버로 테스트한다. 모의 서버 응답은 가정임을 코드 주석에 적는다.

### 의존성

- 새 라이브러리를 추가하기 전에 사용자에게 묻는다. 무엇을 왜 쓰는지와 대안을 함께 말한다.

### 개인정보 · 로그

- 로그와 오류 보고에 고객 이름·연락처(휴대폰 번호 끝 4자리 검색어 포함)·카드 정보·로그인 비밀번호(매장 프로그램 비밀번호, 웨일ERP 비밀번호. T02 개편 전 코드는 대표 휴대폰 번호)를 남기지 않는다. 주문은 `orderId`로만 남긴다.
- 오류 문구 · panic 메시지에 입력값(휴대폰 번호, 점포 고유번호, 아이디, 토큰, 요청 · 응답 본문)을 넣지 않는다. 이 문구들은 그대로 로그 파일(`app.log`)과 "로그 확인" 화면에 남는다. 로그는 `src/shared/log/`의 함수로만 남긴다 (2026-11-17, T14 리뷰).

### 커밋

- 커밋 방식은 전역 규칙(`/ip-commit-push`)을 따른다.
- Plane 작업 항목에 속한 커밋은 본문 마지막 줄(공동 작성자 줄 앞)에 `Refs: WHALEERPPO-<번호>`를 적는다.

## OKF 작업 보고서

기능(태스크, Plane 작업 항목 1개)을 하나 만들 때마다 [Open Knowledge Format(OKF) v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md) 형식으로 작업 보고서를 남긴다. 보고서에는 **작업 내용, 작업 방법, 히스토리**를 반드시 담는다 (2026-11-16 사용자 결정). 나중에 "무엇을, 어떻게, 어떤 과정을 거쳐" 만들었는지 이 파일만 보고 알 수 있어야 한다.

- **위치·파일명**: `docs/okf/YYYY-MM-DD-<태스크-slug>.md` (태스크마다 파일 1개, 날짜는 시작일). 그 태스크의 워크트리(작업 브랜치)에 두고 태스크 커밋에 함께 넣는다.
- **작성 시점**: 지시서를 보낼 때 `status: draft`로 만들고, 일이 생길 때마다 "히스토리"에 한 줄씩 더한다. 구현과 검증이 끝나면 나머지 절을 채운 뒤 사용자에게 결과를 보고한다.
- **작성 주체**: 지휘 세션(`pos-boss`). 작업 세션의 보고를 그대로 옮기지 말고, 직접 확인한 검증 결과를 적는다.
- **함께 갱신**:
  - `docs/okf/index.md`: 보고서 목록. 형식은 `* [제목](./파일명.md) - 한 줄 설명`. 이 파일만 프런트매터 `okf_version: "0.2"`를 가질 수 있다.
  - `docs/okf/log.md`: 날짜별 변경 이력. 최신순, 날짜 제목은 `## YYYY-MM-DD`.
- **리뷰 후**: ② · ③ 리뷰 결과는 "히스토리"와 "검증"에 적는다. 사용자가 최종 승인하면 `verified`에 `human:<id>`와 시각을 추가하고 `status`를 `draft`에서 `stable`로 바꾼다. 리뷰에서 수정 요청이 나오면 반영한 내용을 본문에 덧붙인다.

### 템플릿

```markdown
---
type: Task Report
title: <태스크 이름>
description: <무엇을 했는지 한 문장>
tags: [<영역>, ...]
status: draft
generated:
  by: <도구>/<모델>          # 예: claude-code/claude-opus-5-5
  at: 2027-01-10T15:30:00+09:00
sources:
  - id: spec
    resource: /docs/specs/<스펙 파일>.md
    title: <관련 스펙 구간>
  - id: task
    resource: plane:<작업 항목 ID>   # 예: plane:PROJ-12
    title: <Plane 작업 항목 이름>
# 사용자 리뷰 후 추가:
# verified:
#   - by: human:<id>
#     at: 2027-01-11T10:00:00+09:00
---

# 목표
<이 태스크로 달성하려던 것, 완료 기준>

# 작업 내용
- <무엇을 만들고 바꿨는지, 사용자가 보는 결과 기준으로>

# 작업 방법
- 진행: <지휘 세션 / 작업 세션 이름, 워크트리 · 브랜치>
- 접근: <어떤 구조 · 방식으로 만들었는지, 왜 그 방식인지>
- 쓴 스킬 · 도구: <예: test-driven-development, superpowers:requesting-code-review>
- 시도했다 버린 방법: <있으면, 이유와 함께>

# 변경 파일
- `<경로>`: <무엇을 바꿨는지>

# 검증
- 실행한 명령: `<명령>`
- 결과: <통과/실패, 핵심 출력>

# 결정 사항
- <결정>: <이유>[^spec]

# 남은 일 / 위험
- <다음 태스크로 넘긴 것, 미해결 질문, 알려진 문제>

# 히스토리
<!-- 시간순. 한 줄에 한 사건. 지시서 · 보고 · 질문과 답 · 리뷰 지적과 처리 · 사용자 승인 · 커밋 -->
- 2027-01-10T09:00+09:00 지시서 전달 (pos-boss → pos-T01)
- 2027-01-10T11:20+09:00 작업 세션 질문: <내용> → 사용자 답: <내용>
- 2027-01-10T15:00+09:00 ② 리뷰: 지적 3건 → 고침 2 · 보류 1(<이유>)
- 2027-01-10T16:00+09:00 사용자 "커밋해" → 커밋 `<해시>`

[^spec]: 근거가 된 스펙 구간
```

- 필수 키는 `type` 하나지만, 이 프로젝트에서는 위 템플릿의 키를 모두 채운다(`verified`는 리뷰 후).
- 시각은 시간대를 포함한 ISO 8601 형식(`2027-01-10T15:30:00+09:00`)으로 쓴다.
- 본문의 주장이 특정 문서에 근거하면 각주 라벨을 `sources[].id`와 같게 붙인다.
