# docs/ 문서 검증 보고서

- **작성일**: 2026-11-16
- **검증 주체**: claude-code/claude-fable-5-2 (사실 확인은 서브 에이전트 3개가 공식 문서를 직접 열어 수행)
- **검증 대상**: `docs/` 아래 문서 7개와 `AGENTS.md`의 범위·설계 원칙
- **질문**: 리서치 방향이 맞는가, 프레임워크는 적절한가, 통신 방식에 문제는 없는가, POS 현장 관점에서 빠진 것은 없는가

이 문서의 문장은 세 종류로 나뉜다. 섞어 읽지 않도록 표시를 붙였다.

| 표시 | 뜻 |
|---|---|
| **[확인]** | 공식 문서를 이번에 직접 열어 확인한 사실. 출처 링크가 붙는다 |
| **[판단]** | 검증자의 의견. 출처가 없다. 현장 확인이나 협의로 맞는지 가려야 한다 |
| **[미확인]** | 확인을 시도했지만 근거를 찾지 못한 것 |

---

## 1. 결론부터

| 질문 | 답 |
|---|---|
| 리서치 방향이 맞는가 | **맞다.** 기술 리서치(`store-order-receiver-tech-research.md`)의 주장은 대부분 공식 문서와 일치했다. 완전히 틀린 주장은 없고, 잘못 옮긴 인용이 1건, 표기를 고칠 곳이 10여 건이다 |
| 프레임워크(Tauri + Next.js)는 적절한가 | **Tauri는 Windows 10 이상이면 적절하다.** Next.js는 화면 내장 방식(A-2)을 고르면 얻는 것이 적다. 스펙 단계에서 더 단순한 대안과 비교해야 한다 (3.1절) |
| 통신 방식에 문제는 없는가 | **5가지 후보 모두 쓸 수 있다.** 다만 어느 방식을 골라도 "연결이 살아 있는 동안 빠진 주문"을 잡는 장치가 문서에 없다. 이것이 가장 큰 설계 구멍이다 (2장 H2) |
| POS 현장 관점에서 빠진 것 | **있다.** 출력 실패 감지, 프로그램이 꺼져 있을 때의 주문 처리, 대표님 질문지의 현장 질문(설치 가능 여부, 스피커, 화면)이 빠져 있다 (2장 H3~H5) |

**가장 먼저 고칠 것 5가지**는 2장의 H1~H5다.

---

## 2. 고쳐야 할 것 (심각도 순)

### 높음: 설계나 일정에 영향을 준다

#### H1. "영업 중 다운로드 → 다음 시작 때 설치"는 Tauri 업데이터의 기본 기능이 아니다 [확인]

- **위치**: `docs/proposals/ui-delivery-options.md` 3.1절의 ②안, "전원 차단 대응" 항목
- **문제**
  - 업데이터의 `download()`는 받은 파일을 디스크가 아니라 프로세스 메모리에만 둔다. 프로그램을 끄면 사라진다.
  - JS API의 `install()`은 같은 실행 안에서 `download()`를 먼저 부르지 않으면 오류를 낸다(`Update.install called before Update.download`).
  - 그래서 문서가 "일반적인 조합"이라고 적은 ②안과 "POS 전원을 바로 내려도 영향이 없다"는 설명은 기본 기능만으로는 성립하지 않는다.
- **되게 하는 방법**: 받은 파일과 업데이트 정보를 프로그램이 직접 디스크에 저장하고, 다음 시작 때 Rust API로 복원해서 설치한다. 필요한 API(`Updater::restore_update`, `Update::verify`)는 업데이터 플러그인 2.14.0(2026-10-14)에 추가됐고 Rust 전용이다.
- **제안**: 3.1절에 "②안은 직접 구현해야 한다"를 적는다. 직접 구현하지 않으면 기본 동작에 가장 가까운 것은 ①안(시작할 때 확인하고 바로 설치)이다. 설치 파일이 수 MB 수준이라 ①안의 시작 지연은 크지 않을 것으로 보인다 [판단].
- **출처**: [Tauri Updater](https://v2.tauri.app/plugin/updater/), [plugins-workspace 저장소](https://github.com/tauri-apps/plugins-workspace) (`plugins/updater/src/updater.rs`, `guest-js/index.ts`, `CHANGELOG.md`)

#### H2. 연결이 살아 있는 동안 빠진 주문을 잡는 장치가 없다 [판단]

- **위치**: `docs/requests/backend-api-request.md` 3.3절, `docs/proposals/realtime-delivery-options.md` 1.2절
- **문제**
  - 두 문서 모두 미확인 주문 조회를 "재연결·재시작 시"에만 한다고 적었다.
  - 연결은 멀쩡한데 이벤트 하나만 빠지는 경우가 있다. 예: 서버를 여러 대로 늘렸는데 라우팅 장치가 메시지를 놓친 경우(Redis Pub/Sub는 끊긴 구독자에게 간 메시지를 버린다 [확인]), 서버 쪽 버그.
  - 이때는 재연결이 일어나지 않으므로 그 주문은 다음 재연결 때까지 매장에 나타나지 않는다. `realtime-delivery-options.md` 4장도 이 증상("가끔 주문이 늦게 뜸")을 적고 있지만 해결 장치는 없다.
- **제안**: 실시간 연결과 상관없이 **주기적으로(예: 30~60초마다) 미확인 주문을 조회**한다. 설계 원칙 1("실시간 수신만 믿지 않는다")을 재연결 시점뿐 아니라 평소에도 적용하는 것이다. 주기는 백엔드 팀과 정한다.
- **함께 넣을 것**: 매장 프로그램 쪽 감시 타이머. 서버 하트비트가 일정 시간 오지 않으면 연결이 살아 있어 보여도 끊고 다시 연결한다. `backend-api-request.md` 3.2절이 서버 하트비트(30초 이내)를 요청하고 있으므로 받는 쪽 동작만 스펙에 적으면 된다.

#### H3. 출력 실패를 알아내는 방법이 조사되지 않았다 [확인]

- **위치**: `store-order-receiver-tech-research.md` 5장, `docs/questions/ceo-store-environment.md` Q10(성공 기준 "주문서 출력 실패 0건")
- **문제**: 성공 기준이 "출력 실패 0건"인데, 실패를 프로그램이 알 수 있는지가 리서치에 없다.
- **확인한 사실**
  - Windows 출력 대기열(스풀러)은 프린터 상태를 스스로 묻지 않는다. 대기열이 비어 있으면 프린터가 꺼져 있어도 "준비됨"으로 본다.
  - 대기열에 넣는 데 성공하면 프로그램에는 성공으로 돌아온다. 즉 `WritePrinter` 성공은 "종이에 찍혔다"는 뜻이 아니다.
  - Windows 기본 포트 모니터는 오류 비트 하나만 세운다. 용지 없음·커버 열림 같은 세부 상태는 제조사 드라이버에 달려 있다.
  - 프린터 포트에 직접 연결하면 상태 명령을 쓸 수 있다. Bixolon·세우테크 매뉴얼에 `DLE EOT`(용지 센서 포함), `GS a`(자동 상태 응답)가 있다.
  - Epson은 드라이버에 딸린 Status API를 제공한다(Epson 드라이버가 있어야 쓸 수 있다).
- **의미** [판단]
  - 기존 POS와 프린터를 함께 쓰려면 스풀러 경로를 써야 하고, 그 경로로는 용지 없음을 믿을 만하게 알 수 없다.
  - 전용 프린터를 두면 포트에 직접 연결할 수 있어 상태를 확인할 수 있다. **전용 프린터 권장(질문지 0-2절의 A안)에 "출력 실패를 감지할 수 있다"는 이유가 하나 더 붙는다.**
  - 어느 경로든 "출력했다고 판단했지만 실제로는 안 나온" 경우에 대비해 화면에서 한 번에 재출력할 수 있어야 한다.
- **제안**: 리서치 5장에 "출력 실패 감지" 절을 추가한다. 성공 기준 Q10의 "출력 실패 0건"은 "감지하지 못한 출력 실패 0건"처럼 측정할 수 있는 말로 다듬는다.
- **출처**: [MS KB 160129 (보관 문서)](https://learn.microsoft.com/en-us/previous-versions/troubleshoot/windows/win32/printer-print-job-status), [PRINTER_INFO_2](https://learn.microsoft.com/en-us/windows/win32/printdocs/printer-info-2), [Bixolon SRP-350plusII 명령 매뉴얼](https://www.bixolon.com/_upload/manual/Manual_SRP-350352plusII_Command_Rev_1_02%5B0%5D.pdf), [Epson TM-T20IV TRG](https://files.support.epson.com/pdf/pos/bulk/tm-t20iv_trg_en_rev_d.pdf), [Epson APD6 Status API 개요](https://download3.ebz.epson.net/dsc/f/03/00/16/57/69/32a1246e9189d45f95aa1984db38bc03c6941937/ov_APD6_StatusAPI_L_WM.pdf)
- **한계**: KB 160129는 보관 문서다. 최신 Windows 기준으로 같은 내용을 다시 쓴 현행 문서는 찾지 못했다.

#### H4. 매장 프로그램이 꺼져 있을 때 들어온 주문을 어떻게 할지 정해지지 않았다 [판단]

- **위치**: `backend-api-request.md` 3.4절, 5장
- **문제**
  - 고객은 이미 결제했는데 매장 PC가 꺼져 있거나 인터넷이 끊겨 있으면, 주문은 아무도 모르는 채로 쌓인다. 재연결 후 한꺼번에 나타나도 이미 늦다.
  - 문서는 "ack가 1분 안에 오지 않으면 백엔드가 감지(로그·알림)"까지만 요청한다. 감지한 뒤 고객에게 무슨 일이 일어나는지가 없다.
  - 5장 질문 1(자동 거절·환불)과 질문 3(매장 일시 중지)이 관련 있지만, 둘 다 "선택 사항"처럼 적혀 있다.
- **제안**: 아래 두 가지를 "파일럿 전에 반드시 정할 것"으로 올린다.
  1. **매장 접속 상태에 따른 주문 차단**: 매장 프로그램이 접속해 있지 않으면 고객 앱에서 주문을 받지 않거나 경고한다. 영업 시간 외 주문 차단을 누가 담당하는지도 함께 묻는다.
  2. **미확인·미접수 주문의 후속 처리**: 몇 분 뒤 자동 취소·환불하는지, 점주에게 다른 경로(문자, 전화)로 알리는지.
- 둘 다 백엔드·앱 팀의 일이므로, 이 프로그램은 "접속 중" 신호를 주는 것까지만 맡는다.

#### H5. 대표님 질문지에 현장 질문이 빠져 있다 [판단]

- **위치**: `docs/questions/ceo-store-environment.md`
- **문제**: Windows 버전과 프린터는 잘 묻고 있지만, 아래 항목은 답에 따라 설계가 달라지는데 질문이 없다.

| 추가할 질문 | 왜 중요한가 |
|---|---|
| POS PC에 다른 프로그램을 설치해도 되는가 (PC가 구매인지 렌탈인지, POS 업체가 설치를 막거나 A/S를 거부하지 않는지, 관리자 계정을 아는지) | 설치 자체가 막히면 전제가 무너진다. POS 업체가 잠가 둔 PC가 있다 |
| POS PC에 스피커가 있는가, 소리가 켜져 있는가 | "확실한 알림음"(설계 원칙 4)의 전제다. 스피커가 없으면 외장 스피커나 프린터 부저가 필요하다 |
| 화면을 기존 POS와 같이 쓰는가 (모니터 1대인지, 터치인지, 해상도) | POS가 전체 화면으로 떠 있으면 주문 알림을 어떻게 보여 줄지가 달라진다. 결제 입력 중에 알림 창이 화면을 가로채면 안 된다 |
| PC 사양 (메모리, 32비트/64비트) | `winver`에는 안 나온다. "설정 > 시스템 > 정보" 화면 사진을 함께 받는다. 32비트 Windows도 빌드는 가능하다 [확인] |
| 영수증 용지 폭 (80mm / 58mm) | 한 줄 글자 수가 달라져 주문서 양식이 바뀐다 (4.3절) |
| PC를 매일 끄는가, 절전 모드로 들어가는가 | 업데이트 적용 시점(H1)과 주문 수신 중단에 직접 영향을 준다 |
| 매장에 PC가 여러 대인가 | 같은 주문을 두 대가 동시에 알리고 출력하는 문제 (M3) |

- 위 표의 "POS 업체가 PC를 잠가 둔다", "스피커가 없는 POS가 있다"는 검증자의 일반 지식이며 출처를 확인하지 않았다. 질문으로 넣어 답을 받는 것이 목적이다.

### 중간: 문서 내용을 보완해야 한다

| # | 위치 | 문제 | 제안 |
|---|---|---|---|
| M1 | `ceo-store-environment.md` 0-2절 | "① 드라이버 방식이면 함께 쓰기 대체로 가능"에 전제가 빠졌다. **두 프로그램이 모두** 드라이버(스풀러) 방식일 때만 성립한다. 한쪽이 포트를 직접 잡으면 여전히 충돌한다 [확인된 사실의 귀결] | 표에 조건을 적는다. Q3의 POS 업체 질문은 이미 이 점을 묻고 있어 그대로 둔다 |
| M2 | `backend-api-request.md` 3.5절 | 상태 흐름에 **접수 후 매장 취소**가 없다. 접수하고 나서 재료 소진을 발견하는 경우가 있다 [판단]. `research-comparison.md`도 노쇼·부분 환불 경로 누락을 적고 있다 | 5장 질문에 "접수 후 매장이 취소할 수 있는가, 환불은 어떻게 되는가"를 추가한다 |
| M3 | `backend-api-request.md` 3.1, 3.4절 | **한 매장에 기기가 여러 대**일 때의 동작이 없다. 두 대가 모두 알리고 모두 출력하면 설계 원칙 2(중복 방지)에 어긋난다 [판단] | "매장당 기기 1대" 또는 "출력 담당 기기 지정" 중 무엇으로 할지 정한다 |
| M4 | `backend-api-request.md` 3.2, 3.6절 | 이벤트가 **순서가 바뀌어** 도착하는 경우의 기준이 없다 (예: 취소가 생성보다 먼저 도착) [판단] | 주문 데이터에 `updatedAt` 또는 버전 번호를 넣어, 매장이 더 오래된 내용으로 덮어쓰지 않게 한다 |
| M5 | `ui-delivery-options.md`, 리서치 3장 | **알림음**을 화면(웹뷰)에서 내는 것은 지금 기본값으로 될 가능성이 높지만 근거가 약하다. Tauri가 자동 재생 플래그를 기본으로 넘겨 주는데, Microsoft는 이런 플래그를 실서비스에 쓰지 말라고 경고한다. `additionalBrowserArgs`를 설정하면 이 기본 플래그가 빠진다 [확인] | 스펙에서 "소리는 Rust 본체에서 낸다"와 비교한다. 알림음은 실기기 QA 항목이다 |
| M6 | 리서치 3.2절 | POS용 Windows(IoT Enterprise LTSC)에 **WebView2가 기본으로 깔려 있는지 확인되지 않았다**. LTSC 2019는 Edge조차 기본 포함이 아니다 [확인] | 설치 프로그램이 WebView2 유무를 확인하고 없으면 설치하게 한다. 인터넷이 약한 매장을 생각하면 `offlineInstaller`가 안전하다 [판단] |
| M7 | `backend-api-request.md` 4장, `realtime-delivery-options.md` 7장 | 전달 지연 목표 **"3초 이내"**와 짧은 폴링 **"3초 간격"**이 양립하기 어렵다. 폴링 간격만으로 최대 3초가 걸린다 [판단] | 목표를 "5초 이내"로 풀거나, 짧은 폴링을 고르면 간격을 줄인다. 카페 주문은 제조에 분 단위가 걸리므로 수 초 차이는 크지 않다 [판단] |
| M8 | `ceo-store-environment.md` 0-2절 | 프린터 가격 **"약 10~20만 원"**의 근거가 없다 [미확인]. Epson 영국 공식가로 TM-T20IV가 약 £198이다 | 국내 견적을 받기 전까지 "추정"이라고 적는다 |

### 낮음: 표기와 인용을 고친다

| # | 위치 | 고칠 내용 | 출처 |
|---|---|---|---|
| L1 | 리서치 5.1절, Bixolon plusA&C 행 | "n=1,49는 출력 후 절단, n=0,48은 버퍼 삭제"는 `GS V`가 아니라 바로 앞 명령 `GS T`의 설명이다. `GS V`에는 n 값 표가 없다 | [Bixolon plusA&C Rev 1.04](https://www.bixolon.com/_upload/manual/Manual_SRP-350352plusAC_controlcommands_english_Rev_1_04.pdf) p.39 |
| L2 | 리서치 5.1절, Epson 행 | "65 = 전체 절단"에 "커터가 지원하는 경우"를 붙인다. TM-T88V와 TM-T20IV의 커터는 사양상 부분 절단뿐이다 | [TM-T88V TRG](https://files.support.epson.com/pdf/pos/bulk/tmt88v_trg_reve.pdf), [TM-T20IV TRG](https://files.support.epson.com/pdf/pos/bulk/tm-t20iv_trg_en_rev_d.pdf) |
| L3 | 리서치 2.2절, WebView2 행 | "Enterprise/IoT LTSC 2015·2016·2019·2021"을 고친다. IoT Enterprise LTSC는 2019·2021만 지원 목록에 있다 | [WebView2 소개](https://learn.microsoft.com/en-us/microsoft-edge/webview2/) |
| L4 | 리서치 6.2절, 11장 14번 | AWS IoT Core 영구 세션 만료의 최대 한도는 "확인 불가"가 아니라 **7일**이다 | [AWS IoT Core MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html) |
| L5 | `realtime-delivery-options.md` 6A | "NAT 뒤에 있어 외부 연결을 받을 수 없다"를 "매장 PC가 먼저 연결을 열지 않으면 외부에서 온 연결 시도가 걸러진다"로 고친다. RFC는 일반 명제로 말하지 않는다. 결론(매장 PC가 먼저 연결)은 그대로 맞다 | [RFC 5382](https://www.rfc-editor.org/rfc/rfc5382.html) |
| L6 | 리서치 7장 | 멱등키 초안의 "Standards Track 목표"는 초안 본문에만 있고 IETF 관리 페이지에는 비어 있다. 400/422/409 응답은 필수(MUST)가 아니라 권장(SHOULD)이다 | [IETF Datatracker](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) |
| L7 | `realtime-delivery-options.md` 3장 | "서버 배포 시 연결 전체 끊김"은 서버 1대일 때 맞다. 여러 대를 차례로 교체하면 서버별로 순서대로 끊긴다 | [ALB 타깃 그룹 속성](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html) |
| L8 | `realtime-delivery-options.md` 6A | "①②③은 60초보다 짧은 하트비트 필요"에서 ③(롱 폴링)은 하트비트가 아니라 요청 타임아웃을 60초보다 짧게 두는 것이다. 3장 비교표에는 맞게 적혀 있다 | — |
| L9 | 리서치 2.1절 | 조직용 ESU 페이지의 갱신일이 2026-11-10으로 바뀌었다. 인용한 내용은 그대로다 | [MS ESU](https://learn.microsoft.com/en-us/windows/whats-new/extended-security-updates) |
| L10 | 리서치 3.4절 | `currentUser`라는 값 이름은 Windows Installer 가이드가 아니라 Config 레퍼런스에 있다. 내용은 맞다 | [Tauri Config](https://v2.tauri.app/reference/config/) |
| L11 | 리서치 5.3절 | 따옴표로 인용한 "dwShareMode must be zero (exclusive access)"는 원문 그대로가 아니다. 원문 파라미터 이름은 `fdwShareMode`다 | [MS Communications Resource Handles](https://learn.microsoft.com/en-us/windows/win32/devio/communications-resource-handles) |

---

## 3. 방향 판단

이 장은 대부분 검증자의 판단이다. 결정은 스펙 단계에서 한다.

### 3.1 프레임워크: Tauri + Next.js

**Tauri는 적절하다 (Windows 10 이상 전제).**

- 리서치가 Tauri를 고르면서 댄 사실은 모두 확인됐다 [확인].
  - Tauri 2.12(2026-09-26)에서 Windows 7 지원 중단, 최소 Rust 버전 1.90
  - 업데이터 서명 필수, 키 분실 시 기존 설치본 업데이트 불가, Windows에서 설치 단계에 앱 자동 종료
  - 설치 범위 기본값은 현재 사용자용이고 관리자 권한이 필요 없다
- Windows 10이 지원 종료된 뒤에도 화면 부품(WebView2)은 Windows 10 22H2에서 **최소 2028년 10월까지** 업데이트된다. ESU 가입이 필요 없다 [확인]. 리서치에 없던 사실이고, "Windows 10 이상" 선택을 뒷받침한다.
- 32비트 Windows도 빌드할 수 있다 [확인].

**Next.js는 다시 따져 볼 만하다 [판단].**

- 화면 내장(A-2)으로 정해지면 Next.js는 정적 내보내기로만 쓴다. 서버 렌더링, Server Actions, 미들웨어, 동적 경로를 못 쓴다 [확인].
- 그러면 Next.js를 쓰는 주된 이유가 사라지고 제약만 남는다. 예: 주문 상세를 `/orders/[id]` 경로로 만들 수 없다(리서치 4장에도 적혀 있다).
- 같은 React 화면을 Vite로 만들면 이런 제약이 없고 구성이 단순하다. Tauri 공식 템플릿의 기본 조합이기도 하다.
- 다만 담당자가 Next.js에 익숙하다면 그 자체가 선택 이유가 된다. 1인 개발에서는 익숙한 도구가 일정에 가장 큰 영향을 준다.

**스펙 단계에서 확인할 것**

| 항목 | 이유 |
|---|---|
| 담당자의 Rust 경험 | 주문 수신, 재연결, 프린터 출력(Win32 API 직접 호출), 업데이트 파일 저장(H1)이 모두 Rust 쪽 일이다. 파일럿까지 약 3개월이다 |
| 다른 후보와의 비교 | Electron(JavaScript만으로 가능, 설치 파일과 메모리 사용이 큼), .NET(프린터 제조사 SDK가 .NET용으로 나오는 경우가 많음), Flutter(Windows 10 이상) |
| 매장 PC 사양 | 메모리가 적은 구형 POS에서 웹 화면 부품이 얼마나 무거운지는 실기기로 봐야 한다 |

### 3.2 통신 방식

**후보 5가지는 모두 쓸 수 있고, 문서의 비교는 정확하다.** 인용한 수치(ALB 60초, nginx 60초, 롱 폴링 30초, SSE 15초 주석, Redis Pub/Sub at-most-once, AWS IoT Core QoS 2 미지원)는 모두 원문과 일치했다 [확인].

**어느 방식을 골라도 누락 방지는 실시간 연결이 아니라 아래 장치가 맡는다 [판단].**

1. 주문마다 수신 확인(ack)
2. 주기적인 미확인 주문 조회 (재연결 때뿐 아니라 평소에도, H2)
3. `orderId`/`eventId`로 중복 제거

이 셋이 있으면 실시간 연결은 "빨리 알려 주는 장치"일 뿐이고, 방식을 나중에 바꿔도 누락 위험이 달라지지 않는다. 문서 5장의 "수신 모듈만 교체" 구조가 이 점에서 옳다.

**파일럿에 대한 의견 [판단]**

- 매장 1곳, 개발자 1명, 약 3개월이라는 조건이면 **짧은 폴링 또는 SSE**가 부담이 가장 적다.
- 짧은 폴링은 위 2번 장치를 그대로 실시간 수신으로 쓰는 것이라 만들 것이 가장 적다. 지연은 폴링 간격만큼 생긴다(M7).
- MQTT는 파일럿 규모에서는 새 인프라와 기기 인증서 관리 부담이 이득보다 크다. AWS IoT Core는 세션이 만료돼 버려진 메시지에도 요금을 매긴다 [확인].
- 최종 결정은 백엔드 PL 회의의 몫이다. 문서가 권장을 하지 않는 중립 자료로 쓰인 것은 그대로 두는 편이 좋다.

**스펙에 넣을 것 [판단]**

- 매장 PC의 시계가 틀린 경우. 화면의 경과 시간은 서버 시각 기준으로 계산하고, 토큰 만료 판단을 PC 시계에만 맡기지 않는다.
- PC가 절전 모드에 들어가면 연결이 끊긴다. 설치 안내에 절전 해제를 넣는다.

### 3.3 프린터

**리서치의 큰 방향은 맞다.** 시리얼 포트 독점, Epson LAN 포트의 출력 연결 1개, 스풀러 RAW 경로, `GS V`가 모델마다 다르다는 점은 모두 확인됐다 [확인].

보완할 것은 세 가지다.

1. **출력 실패 감지** (H3). 가장 큰 구멍이다.
2. **한 줄 글자 수가 모델마다 다르다** [확인]. 같은 80mm 용지라도 해상도에 따라 42자 또는 48자다. 한글은 그 절반(21자/24자)이다. 주문서 양식은 모델별 설정이 필요하다.

| 모델 | 해상도 | 80mm 한 줄 글자 수 | 한글 |
|---|---|---|---|
| Epson TM-T88V | 180dpi | 42자 | 표기 없음 |
| Epson TM-T20IV | 203dpi | 48자 (42칸 모드 있음) | 표기 없음 |
| Bixolon SRP-330II / 332II | 180 / 203dpi | 42자 / 48자 | 21자 / 24자 |
| 세우테크 SLK-TS400 | 180dpi | 42자 | 표기 없음 |

3. **한글 출력 방식은 여전히 열려 있다.** Bixolon·세우테크 한국 모델이 한글 2바이트 코드를 기본으로 해석하는지는 이번에도 공식 문장을 찾지 못했다 [미확인]. 프린터 모델이 정해지기 전에는 "글자를 이미지로 바꿔 출력"하는 방식이 모델에 가장 덜 묶인다 [판단]. 실물 출력 확인은 사용자 QA 항목이다.

**전용 프린터 권장은 타당하다 [판단].** 기존 POS와의 충돌이 사라지는 것에 더해 출력 실패를 감지할 수 있다(H3).

### 3.4 화면 배포 방식 (A-1 / A-2)

**어느 쪽이 낫다고 단정하지 않는다. 협의로 정할 일이다 [판단].** (2026-11-16 담당자와 논의 후 수정. 처음에는 A-2에 동의한다고 적었다.)

- **기능은 두 방식이 같다.** A-1에서도 웹 서버에서 내려온 화면이 프린터 같은 PC 기능을 부를 수 있다. Tauri 설정에 허용할 웹 주소를 등록하는 방식이다 [확인]. 주문 수신·알림음·출력은 두 방식 모두 Rust 껍데기가 맡는다.
- **갈리는 것은 운영 책임이다.**
  - A-1은 화면 수정이 바로 반영되지만 웹 서버를 새로 구축하고 운영해야 한다. 현재 이 용도의 서버는 없다. 서버가 죽으면 전 매장 화면이 영향받는다.
  - A-2는 서버가 필요 없지만 화면을 고칠 때마다 설치 파일을 배포해야 하고, 업데이트 흐름에 추가 개발이 든다(H1).
- **인터넷 끊김은 처음 판단보다 차이가 작다.** 끊기면 어느 방식이든 주문을 받지 못한다. A-1도 이미 떠 있는 화면은 유지된다. 차이는 끊긴 상태에서 프로그램을 켜거나 새로고침할 때뿐이고, 껍데기에 대체 화면을 넣어 막을 수 있다.
- **보안 차이는 남는다.** A-1은 웹 서버가 뚫리면 매장 PC의 허용된 기능이 호출될 수 있다. Tauri 공식 문서가 이 설정을 "매우 신중하게" 쓰라고 한다 [확인].
- 담당자의 원래 구상은 A-1이었고, 결정은 담당자 혼자 하지 않는다. `AGENTS.md`의 "담당자 의견은 A-2" 표기는 고쳤다.

협의 문서(`ui-delivery-options.md`)에는 위 내용을 반영했다: 2.1절(기능 동일) 추가, 3.1절 ②안 수정(H1), 인터넷 끊김 행 수정, 웹 서버 구축·운영 담당 항목 추가.

---

## 4. 새로 확인한 사실 (리서치에 없던 것)

| 사실 | 의미 | 출처 |
|---|---|---|
| Edge와 WebView2는 Windows 10 22H2에서 최소 2028년 10월까지 업데이트된다. ESU 가입이 필요 없다 | Windows 10 매장도 화면 부품 보안은 2년쯤 더 유지된다 | [Edge 지원 OS](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-supported-operating-systems) |
| Windows 10 IoT Enterprise LTSC 2019에는 Edge가 기본 포함이 아니다 (OEM이 넣는 방식) | WebView2 유무를 설치 때 확인해야 한다 (M6) | 같은 문서 |
| 일반 "Windows 10 Enterprise LTSC 2021"(IoT 아님)은 지원 기간이 5년이다. 10년은 IoT Enterprise LTSC만 해당한다 | 질문지 Q1에서 에디션 이름을 정확히 받아야 한다 | [LTSC 2021 안내](https://learn.microsoft.com/en-us/windows/whats-new/ltsc/whats-new-windows-10-2021) |
| 업데이터에 설치 후 재실행을 끄는 옵션(`restartAfterInstall`)이 있다 | 업데이트 적용 시점 설계에 쓸 수 있다 | [plugins-workspace CHANGELOG](https://github.com/tauri-apps/plugins-workspace) |
| Tauri는 Windows에서 소리 자동 재생 플래그를 기본으로 넘긴다. `additionalBrowserArgs`를 쓰면 빠진다 | 알림음 설계 (M5) | [wry 저장소](https://github.com/tauri-apps/wry), [WebView2 브라우저 플래그](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags) |
| Edge는 버전 128부터 SSE3가 없는 CPU를 지원하지 않는다 | 아주 오래된 POS CPU는 해당될 수 있다 | [Edge 지원 OS](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-supported-operating-systems) |
| AWS IoT Core 영구 세션은 최대 7일까지 늘릴 수 있다. 만료로 버려진 메시지도 과금된다 | MQTT 선택 시 비용 | [AWS IoT Core MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html) |
| ALB는 교체되는 서버의 연결을 기본 300초 안에 끊는다. nginx 설정 리로드만으로는 기존 연결이 바로 끊기지 않는다 | 서버 배포 때 매장 재연결이 얼마나 자주 일어나는지 | [ALB 타깃 그룹 속성](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/edit-target-group-attributes.html), [nginx 제어](https://nginx.org/en/docs/control.html) |
| `escpos` 크레이트에는 스풀러(`WritePrinter`) 경로 드라이버가 없다 | 스풀러 출력은 `windows` 크레이트로 직접 만들어야 한다 | [docs.rs escpos](https://docs.rs/escpos/latest/escpos/) |
| Epson TM-T88V는 용지 폭을 80mm에서 58mm로 바꾸면 되돌릴 수 없다 | 설치 안내 주의 사항 | [TM-T88V TRG](https://files.support.epson.com/pdf/pos/bulk/tmt88v_trg_reve.pdf) |

---

## 5. 맞다고 확인한 것 (요약)

아래는 공식 문서와 일치했다. 문서를 고칠 필요가 없다.

- **Windows**: Windows 7·POSReady 7·Windows 10 22H2·IoT Enterprise LTSC 2016/2019/2021의 지원 종료일, 소비자 ESU 종료일(2027-10-12), WebView2의 Windows 7용 마지막 버전(109)
- **Tauri**: 2.12의 Windows 7 지원 중단과 Rust 1.90, 업데이터 서명·자동 종료·설치 모드, NSIS 설치 범위, WebView2 설치 모드별 크기, Next.js 가이드의 정적 내보내기 요구
- **Next.js**: 정적 내보내기의 미지원 기능 목록
- **코드 서명**: EV 인증서가 SmartScreen 경고를 바로 없애지 못함, Artifact Signing의 한국 조직 지원, 인증서 최대 유효기간 460일
- **프린터**: COM 포트 독점, Epson TM-T20IV의 9100 포트 사양, 스풀러 RAW 전송 절차, Bixolon SRP-350plusII의 `GS V`, Epson 한국 모델의 한글 글꼴 내장, TM Virtual Port Driver
- **실시간 전달**: ALB·nginx 타임아웃, SSE·롱 폴링·WebSocket·MQTT 표준 인용, Redis Pub/Sub와 Streams, AWS IoT Core 수치
- **Rust 크레이트**: `escpos`, `windows`, `serialport`, `tokio-tungstenite`, `eventsource-client`, `rumqttc`의 버전과 날짜

---

## 6. 이번에도 확인하지 못한 것

| 항목 | 시도한 것 |
|---|---|
| Epson ESC/POS 명령 레퍼런스 원문 (`GS V`, `FS &`, `ESC a` 등) | 온라인 레퍼런스가 자동 수집에 403을 돌려준다. 명령 본문이 실린 다른 Epson 공식 PDF를 찾지 못했다 |
| Bixolon·세우테크 한국 모델의 한글 코드 처리 | Bixolon 통합 명령 매뉴얼은 404, 세우테크 제조사 사이트는 인증서 오류로 열지 못했다 |
| IoT Enterprise LTSC 2019/2021에 WebView2 Runtime이 기본으로 깔려 있는지 | Microsoft 문서 5개를 열었지만 명시한 문장이 없다 |
| 플래그 없는 WebView2의 소리 자동 재생 기본 동작 | Microsoft 문서에서 명시한 문장을 찾지 못했다 |
| 여러 프로그램의 RAW 출력이 대기열에서 섞이지 않는다는 Microsoft 문장 | 스풀러 관련 문서 3개를 열었지만 없다 |
| 스풀러의 `ReadPrinter`로 프린터 상태 응답을 읽을 수 있는지 | Microsoft·제조사 문서에 없다 |
| 영수증 프린터 국내 가격 | 국내 공식 판매가 페이지를 찾지 못했다 |
| Windows 10 소비자 ESU의 한국 적용 조건 | 영문 페이지만 확인했다 |
| 32비트에서 Tauri 오프라인 설치 모드가 32비트용 WebView2를 고르는지 | 확인하지 않았다 |

실물로만 알 수 있는 것(출력물의 한글·줄바꿈·절단, 알림음 크기, 출력 실패 시 Windows가 알려 주는 상태)은 프린터와 PC가 정해진 뒤 사용자 QA 체크리스트로 넘긴다.

---

## 7. 업계 리서치 문서에 대하여

`coffee-smart-order-admin-system.md`는 `research-comparison.md`의 평가가 맞다. 범위가 이 프로젝트보다 훨씬 넓고 출처가 없다. 문서 머리말에 이미 주의 안내가 붙어 있으므로 추가로 고칠 것은 없다.

참고할 만하다고 남겨 둔 3.1절(주문 상태 흐름)의 **자동 접수** 아이디어는 스펙 단계에서 다룰 만하다 [판단]. 피크타임에는 점원이 접수 버튼을 누를 여유가 없을 수 있다. 접수할 때 예상 소요시간을 매번 입력하게 하면(`backend-api-request.md` 3.5절) 클릭이 늘어나므로 기본값이 필요하다.

---

## 8. 문서별 수정 목록

| 문서 | 고칠 항목 |
|---|---|
| `docs/proposals/ui-delivery-options.md` | H1 (3.1절 ②안, 전원 차단 대응) |
| `docs/requests/backend-api-request.md` | H2, H4, M2, M3, M4, M7 |
| `docs/proposals/realtime-delivery-options.md` | H2, M7, L5, L7, L8 |
| `docs/questions/ceo-store-environment.md` | H3(성공 기준 문구), H5, M1, M8 |
| `docs/research/store-order-receiver-tech-research.md` | H3(절 추가), M5, M6, L1~L4, L6, L9~L11, 4장의 새 사실 |
| `AGENTS.md` | "문서 위치" 표에 `docs/reviews/` 추가 |

**반영 현황 (2026-11-16)**

| 항목 | 상태 | 반영한 곳 |
|---|---|---|
| H1 | 반영 | `ui-delivery-options.md` 3.1절 |
| H2 | 반영 | `backend-api-request.md` 2장·3.2·3.3절, `realtime-delivery-options.md` 1.2절·4장 |
| H3 | 반영 | 리서치 5.5절(신설)·10.2절, `ceo-store-environment.md` 0-2절·Q10 |
| H4 | 반영 | `backend-api-request.md` 3.9절(신설)·5장 질문 1·7·8 |
| H5 | 반영 | `ceo-store-environment.md` D장 Q11~Q17(신설)·답변 기록 표 |
| 화면 배포 방식 표기 | 반영 | `AGENTS.md` 미결정 사항 표, 이 문서 3.4절 |
| M1, M8 | 반영 | `ceo-store-environment.md` 0-2절·Q5 |
| M2, M3, M4 | 반영 | `backend-api-request.md` 3.1·3.2·3.6절, 5장 질문 9·10 |
| M5, M6 | 반영 | 리서치 3.2절·3.9절(신설) |
| M7 | 반영 | `backend-api-request.md` 4장, `realtime-delivery-options.md` 7장 |
| L1~L4, L6, L9~L11 | 반영 | 리서치 2.1·2.2·3.4·5.1·5.3·6.2절, 7장, 11장 |
| L5, L7, L8 | 반영 | `realtime-delivery-options.md` 3장·6A |
| 4장의 새 사실 | 반영 | 리서치 2.2·3.2·3.3·3.9·5.4·6.2·6.3절 |
| `AGENTS.md` "문서 위치" 표에 `docs/reviews/` 추가 | 반영 | `AGENTS.md` |
