# 매장 단말 주문 전달 방식: 업계 공개 사례 리서치

- **작성일**: 2026-11-16
- **작성 주체**: Claude 리서치 에이전트 (claude-code/claude-fable-5-2)
- **범위**: 배달의민족, 토스플레이스, 스타벅스, 국내 커피 주문·POS 서비스, 해외(Uber Eats, DoorDash, Square, Toast)가 **결제 완료된 주문을 매장 단말(주문접수 프로그램, POS, 태블릿)로 전달하는 방식**에 대해 회사가 직접 공개한 내용. 전달 방식, 누락 방지, 미접수 처리, 고객 취소 범위, 단말 구성을 본다.
- **관련 문서**: `docs/proposals/realtime-delivery-options.md`(비교 중인 5가지 방식), `docs/research/store-order-receiver-tech-research.md` 6~7장(표준·인프라 근거)
- **이 문서의 신뢰 기준**
  - 근거로 쓰는 것: 회사 자체 기술 블로그, 공식 개발자 문서, 공식 고객센터·사장님 가이드, 공식 보도자료(회사 뉴스룸). 제3자 블로그·커뮤니티·뉴스 기사·구인 공고는 근거로 쓰지 않는다. 검색 중에 본 2차 자료는 5장에 "뺀 자료"로만 적는다.
  - 모든 주장에 출처 링크, 게시일, 원문 인용을 붙인다. 페이지에 게시일이 없으면 "게시일 표기 없음"이라고 쓴다. 모든 링크의 접근일은 2026-11-16이다.
  - **인용 확인 수준을 두 가지로 구분한다.**
    - **[원문 확인]**: 페이지 HTML을 직접 내려받아 해당 문장이 있는지 확인했다.
    - **[도구 요약 경유]**: 페이지가 자동 수집을 막거나(403/406) 스크립트로 그려져서, 웹 열람 도구(페이지를 읽어 요약해 주는 모델)를 거쳐서만 확인했다. 인용문의 글자 하나하나까지는 보장하지 못한다. 회의 자료에 옮길 때는 링크를 열어 한 번 더 확인해야 한다.
  - **구간을 구분한다.** 이 문서가 알고 싶은 것은 "서버 → 매장 단말" 구간이다. 그런데 해외 공개 문서 대부분은 "주문 플랫폼 서버 → POS 회사 서버" 구간(서버끼리의 웹훅)을 설명한다. 이 경우 **[다른 구간: 서버 간]** 이라고 표시한다. 매장 단말 구간으로 옮겨 읽지 않는다.
  - 오래된 글은 "당시 기준"이라고 밝힌다. 확인하지 못한 것은 **"확인 불가"**로 쓰고 5장에 시도한 것을 적는다.
  - 4장(시사점)에서는 사실과 해석을 나눈다. 해석에는 **(해석)**을 붙인다. 최종 권장은 하지 않는다.

---

## 1. 요약

### 1.1 한눈에 보기

| 서비스 | 매장 단말로의 전달 방식 | 누락 방지 장치 | 미접수 시 처리 | 고객 취소 범위 | 단말 구성 |
|---|---|---|---|---|---|
| **배달의민족** | **확인됨.** 폴링(2017 이전) → MQTT(2017~) → AWS IoT(MQTT) → **SSE(2025-10 글 기준, PC 클라이언트)**. 모바일 앱은 푸시 알림(FCM/APNs) | **확인됨.** `Last-Event-ID` 재전송, 이벤트별 수신 확인(commitUrl), 미확인 이벤트를 주문 상태와 대조해 재전송, 기기당 연결 1개 | **확인됨.** 가게배달·배민배달 3분 미접수 자동 취소. 취소·거부 2건 이상이면 당일 자동 영업 임시중지 | 확인 불가 | Windows·macOS PC, Android/iOS 앱, Android POS·태블릿. 주문서 출력 지원 |
| **토스플레이스** | **자사 포스 내부 전달 방식은 확인 불가.** 외부 연동용으로 Plugin SDK 이벤트 리스너, Open API 웹훅을 제공[다른 구간: 서버 간 포함] | 웹훅은 at-least-once, `x-toss-webhook-id` 멱등 키 [다른 구간: 서버 간] | **확인됨.** 토스오더 픽업주문 5분 미수락 자동 취소, 마감 30초 전 알림, 고객에게 알림톡 | 확인 불가 | 토스 포스(Windows·Android·iOS·Mac) + 토스 프론트 |
| **스타벅스(한국)** | 확인 불가 | 확인 불가 | 확인 불가 | **확인됨.** 매장이 주문을 승인하기 전까지만 취소 가능(2024-12-19부터) | 확인 불가 |
| **스타벅스(미국)** | 확인 불가 | 확인 불가 | 확인 불가 | 확인 불가 | 확인 불가 |
| **메가MGC·컴포즈·매머드·패스오더·페이히어** | 확인 불가 | 확인 불가 | 확인 불가 | 확인 불가 | 확인 불가 |
| **Uber Eats** | 매장 태블릿 앱 내부 방식은 확인 불가. POS 연동은 웹훅 [다른 구간: 서버 간] | 200 응답으로 수신 확인, 최대 7회 재전송, `event_id`로 중복 제거 [다른 구간: 서버 간] | **확인됨.** 11.5분 내 수락/거절 없으면 자동 취소. 미처리 2건이면 매장 자동 일시중지 | 확인 불가 | 태블릿 앱(앱이 화면 앞에 떠 있어야 수신), 웹, 휴대폰 앱. 프린터 연결 가능 |
| **DoorDash** | 매장 태블릿 내부 방식은 확인 불가. POS 연동은 웹훅 [다른 구간: 서버 간] | 5xx 응답 시 0.3초 간격 최대 3회 재시도 [다른 구간: 서버 간] | **확인됨(POS 연동).** 3~8분 내 확정이 없으면 실패 처리. 특수한 경우 태블릿으로 넘김 | 확인 불가 | 태블릿(수동 확정 또는 자동 확정), POS 연동 |
| **Square** | 매장 POS 앱 내부 방식은 확인 불가. 개발자용은 웹훅 [다른 구간: 서버 간] | 최대 24시간 재전송, `event_id`로 중복 제거, 순서 보장 없음 [다른 구간: 서버 간] | 확인 불가 | 확인 불가 | 확인 불가(이번에 공식 도움말을 직접 열지 않음) |
| **Toast** | 매장 POS 내부 방식은 확인 불가. 개발자용은 웹훅 + 조회 API [다른 구간: 서버 간] | 5분·10분 뒤 2회 재전송, "모든 웹훅에 대체 조회 API가 있다. 주기적으로 조회하라", 이벤트 GUID로 중복 제거 [다른 구간: 서버 간] | **확인됨.** 매장이 오프라인이면 온라인 주문 페이지가 약 5분 안에 주문 받기를 멈춤. 자동 승인 기기가 5분간 멈춰도 중단될 수 있음 | 확인 불가 | 유선 연결된 고정 단말 1대를 온라인 주문 자동 승인 기기로 지정 |

### 1.2 확인된 것 / 확인 못 한 것

| 구분 | 내용 |
|---|---|
| **확인된 것** | ① 배달의민족은 매장 단말 전달 방식의 변천(폴링 → MQTT → SSE)과 누락 방지 설계를 자사 기술 블로그에 직접 공개했다. 이번 조사에서 "매장 단말 구간"을 기술적으로 설명한 1차 자료는 이것이 유일하다. ② 미접수 주문 자동 취소 시간(배민 3분, 토스오더 5분, Uber Eats 11.5분, DoorDash POS 연동 3~8분)과 매장 자동 일시중지 정책은 여러 회사의 공식 가이드에서 확인된다. ③ 서버 간 웹훅 문서들은 공통으로 "재전송된다, 중복될 수 있다, 고유 ID로 걸러라"고 쓴다. |
| **확인 못 한 것** | ① 토스 포스, 스타벅스, 국내 커피 프랜차이즈 앱, 패스오더, 페이히어의 매장 단말 전달 방식. ② Uber Eats·DoorDash 태블릿 앱, Square·Toast POS가 자사 서버에서 주문을 받는 내부 방식. ③ 고객 취소 허용 범위(스타벅스 코리아 외). ④ 프린터 출력 방식의 기술 세부. |

---

## 2. 서비스별 상세

### 2.1 배달의민족 (우아한형제들)

배민은 주문접수 프로그램의 주문 전달 방식을 자사 기술 블로그에 세 번에 걸쳐 공개했다. 아래는 시간순이다.

#### (1) 2017년: 폴링에서 MQTT로 — 「MQTT 적용을 통한 중계시스템 개선」

- 출처: [우아한형제들 기술블로그](https://techblog.woowahan.com/2540/), 게시일 2017-08-11, 글쓴이 임동규. **[원문 확인]** **당시 기준**이다.
- **이전 구조는 폴링이었다.**
  > "주문중계채널은 개별 디바이스들이 중계서버에 일정시간에 한번씩 API polling을 하는 구조로 운영되고 있습니다. 신규주문 뿐만 아니라 주문의 취소나 상태변경과 같은 정보를 전달 받기 위해 API polling을 수행합니다."
- **폴링을 바꾼 이유는 서버 부하와 비용이었다.**
  > "이러한 polling 횟수 증가는 대응 API에 부하를 가져와 auto-scale에 의한 instance 수 증가와 이에 따른 운영비용 상승의 원인이 됩니다."
- 폴링 요청을 "기기가 살아 있다"는 신호로도 쓰고 있었다.
  > "각 채널의 개별 디바이스들의 live 상태를 API 서버를 통해 update 해야 하는데 이전에는 polling API를 live signal로 판단했습니다."
- **MQTT 브로커 구성**: "AWS ElasticBeanstalk + Node.js", 모듈은 mosca. "QoS 0 또는 QoS 1 지원."
- **MQTT로는 주문번호만 보내고, 내용은 API로 가져온다.**
  > "발생한 이벤트에 대해서 주문번호를 MQTT로 전송하고 이를 기반으로 API에서 data를 가져오게 함으로써 좀 더 정확한 전달을 기대할 수 있게 되기를."
- **폴링은 보조 수단으로 남기려 했다.**
  > "당초 단말기를 제외한 모든 채널을 MQTT로 통합하고 client에서의 API polling을 보조적 수단으로 지원하는 것을 목표로 했습니다."
- **모바일 앱과 전용 단말기에는 MQTT를 적용하지 못했다.**
  > "스마트폰의 최근 OS에서 battery와 memory의 효과적 관리를 위한 보호모드로 인해 MQTT 접속이 지속될 수 없음을 확인하게 됩니다."
- 주의: 이 글의 "적용 효과"는 "~되기를"로 끝나는 기대 효과다. 측정 결과가 아니다.

#### (2) 2019년: Windows PC 접수 프로그램의 존재 — 「Dll을 이용하여 배달대행 주문정보 연동」

- 출처: [우아한형제들 기술블로그](https://techblog.woowahan.com/2635/), 게시일 2019-06-27. **[원문 확인]** **당시 기준**이다.
- 이 글의 주제는 배달대행 프로그램과의 연동이다. 주문 전달 방식은 다루지 않는다. 단말 구성에 대한 사실만 가져온다.
- PC 접수 프로그램은 Windows 프로그램이고 영수증을 출력한다.
  > "이 개발자는 업주님들이 주문을 받고 영수증을 출력하는 등의 작업을 하는 아래와 같은 PC접수 프로그램을 개발합니다."
- 글의 태그는 `#Delphi`, `#Windows`다. 당시 PC 접수 프로그램이 Delphi로 만들어졌다는 본문 문장은 찾지 못했다. 태그로만 확인된다.
- 외부 프로그램이 프린터 출력을 가로채려다 생긴 장애 사례가 있다.
  > "API Hook에 실패하면 프로그램을 죽인다거나 프린터 정보를 잘못 처리하여 영수증 인쇄가 안된다거나 프로그램이 죽는 상황이 계속 발생했고"

#### (3) 2025년: MQTT에서 SSE로 — 「Server-Sent Events로 실시간 알림 전달하기」

- 출처: [우아한형제들 기술블로그](https://techblog.woowahan.com/23199/), 게시일 2025-10-24(수정 2026-01-29), 글쓴이 한우석(주문접수채널팀). **[원문 확인]**
- 이 글은 이번 조사에서 가장 직접적인 자료다. 대상이 주문접수 프로그램(매장 단말)이고, 주제가 서버 → 단말 실시간 전달이다.

**단말 구성**
> "이 프로그램을 만드는 팀이 바로 주문접수채널팀으로, Windows·macOS PC, 모바일 앱(Android, iOS), Android POS 등 다양한 환경에서 사용할 수 있도록 개발하고 있습니다."

**기존 방식(MQTT)의 문제**

| 문제 | 원문 |
|---|---|
| MQTT로는 내용 없는 신호만 보냈다 | "전달하는 메시지는 Zero payload 형식으로 전달하고, 메시지를 수신하면 API를 호출하여 클라이언트에 하드코딩된 알림을 노출하고 있었습니다." |
| **매장 방화벽이 MQTT 포트를 막는 경우가 있었다** | "MQTT는 HTTP 프로토콜과 다르기 때문에 1883/8883 포트를 사용합니다. 하지만 일부 네트워크 환경에서는 해당 포트가 방화벽으로 차단되어 있어 메시지를 수신하지 못하는 문제가 있었습니다." |
| **그래서 MQTT와 폴링을 함께 돌려야 했다** | "이를 해결하기 위해 MQTT를 사용하면서도, 메시지 수신을 보장하기 위한 Polling 로직을 병행해야 했습니다." |
| 웹뷰에서 MQTT 연결이 어려웠다 | "Webview 환경에서는 MQTT over WebSocket 연결에 제약이 있었습니다." |

**중간 단계: AWS IoT 도입**
- 자체 브로커에서 AWS IoT로 옮기고, 기기별 X.509 인증서와 매장별 구독 권한을 적용했다.
  > "각 클라이언트는 MQTT 브로커와 연결하기 전 X.509 인증서를 통하여 private key를 발급받아 연결합니다."
- 그래도 방화벽 문제는 남았다.
  > "AWS IoT도 MQTT를 사용하기 때문에, 네트워크 방화벽으로 MQTT 수신이 차단된 환경에서는 Polling이 필요했습니다."

**WebSocket이 아니라 SSE를 고른 이유**
> "클라이언트에서 서버로는 REST API를 사용하고, 서버에서 클라이언트로는 실시간 메시지를 전달하는 구조입니다."

> "두 가지 프로토콜을 동시에 운영하는 것보다 REST API + SSE 조합이 관리 비용 측면에서 효율적입니다"

> "클라이언트의 응답이 필요한 경우 기존 REST API를 활용하면 충분합니다"

**서버가 여러 대일 때의 메시지 분배**
- 세 가지 방식(연결된 서버를 찾아 API 호출 / 연결된 서버로만 전달 / 모든 서버로 전달)을 비교하고 세 번째를 골랐다. 브로커는 Kafka다.
  > "위 세 가지 방식을 비교한 결과, 저희는 3번 메시지 브로커 방식을 선택하였습니다."

  > "네트워크 홉이 증가하고 수십ms단위의 레이턴시가 증가하지만, 정확성과 안정성이 더 중요하므로 허용 가능한 수준이었습니다."
- 서버 기술: "저희 팀은 Spring Webflux + Coroutine 환경으로 구축되어 있습니다."

**누락 방지 장치**

| 장치 | 원문 |
|---|---|
| 매장별 순서 보장 | "파트너별로 파티션을 분리하여 메시지 순서를 보장" |
| 이력 보관 | "SSE 연결이 끊어진 경우를 대비하여 메시지 이력을 일정 기간 보관" |
| 재연결 시 재전송 | "Last-Event-ID를 통해 재연결 시 놓친 메시지를 차례대로 재전송" |
| **이벤트별 수신 확인(ack)** | "중요한 이벤트들을 CommitEvent라는 interface로 정의하고, 해당 이벤트에는 commitUrl이 포함되어 내려갑니다. 클라이언트는 이벤트를 수신하면 해당 URL을 호출하게 되어있습니다." / "서버는 해당 URL이 호출되면 디바이스가 이벤트를 수신한 것으로 인지하고 DB에 마킹합니다." |
| **미확인 이벤트를 주문 상태와 대조한 뒤 재전송** | "수신 확인이 되지 않은 이벤트 중, 현재 주문 상태와 비교하여 불필요한 이벤트를 제외하고 전송합니다." / "클라이언트가 신규 주문에 대한 이벤트 수신을 하지 못했지만 이미 주문이 접수된 상태라면 주문서를 다시 출력하면 안 되는 정책이 있기 때문입니다." |
| 기기당 연결 1개 | "새로운 연결 시 기존 연결을 자동으로 종료" / "메시지 전송 시 활성 세션인지 확인하여 활성 세션에만 메시지 전달" |
| 하트비트 겸 온라인 표시 | "서버 내부적으로 heartbeat을 전송하는 시점에 online 상태 정보를 갱신하도록 하였습니다." |

**주문서 출력을 "딱 한 번"의 대표 사례로 든다**
> "주문 접수 프로그램에서는 반드시 딱 1번 전달해야 하는 이벤트들이 있습니다. 여러 이벤트가 있지만 그중 하나의 예로 주문서 프린트가 있습니다."

> "만약 같은 주문서가 여러 번 출력되면 파트너분들께서 중복 주문으로 오인하실 수 있고, 반대로 주문서가 출력되지 않으면 신규 주문을 인지하지 못하는 치명적인 상황이 발생할 수 있습니다."

**운영 중 겪은 문제**
- 서버 재배포 때 모든 매장이 한꺼번에 재접속해 CPU가 치솟았다. 세션 지속 시간과 재시도 시간을 무작위로 흩어 해결했다.
  > "서버가 종료되기 전 각 세션에 retry 시간을 random하게 부여하여 배포하더라도 골고루 연결을 시도할 수 있도록 하였습니다."

**적용 범위와 결과**
- SSE는 PC 클라이언트에만 적용된 상태다(글 게시 시점).
  > "현재 PC 클라이언트에만 적용된 SSE를 모바일 앱으로 확대" / "Background 상태에서는 기존 Push Notification 활용"
- 폴링을 없앴다고 쓴다.
  > "표준 HTTP 포트 사용: 방화벽 이슈 해결 및 Polling 로직 제거" / "운영 복잡도 감소: MQTT와 Polling을 동시에 운영하던 것을 SSE로 단일화"
- 규모: "메시지 처리량: 일평균 약 4천만 건의 이벤트를 안정적으로 처리"
- 주의: 글은 "많은 Polling 로직들을 제거할 수 있습니다"라고 쓰지만, 재시작 직후 주문 목록을 어떻게 불러오는지(전체 조회 API 유무)는 설명하지 않는다. "폴링이 하나도 남지 않았다"고까지 읽을 근거는 없다.

#### (4) 2025년: 클라이언트 구조 — 「배달의민족 주문접수 채널에 Flutter를 도입하며 고민한 것」

- 출처: [우아한형제들 기술블로그](https://techblog.woowahan.com/24337/), 게시일 2025-12-16(수정 2026-02-03). **[원문 확인]**
- **지원 플랫폼과 추세**
  > "최근까지 Windows, Android 모바일, iOS 세 가지 플랫폼을 지원하고 있었지만" / "Android 태블릿/POS: Windows POS에서 Android 기반 디바이스로 전환 추세"

  > "현재는 Android 태블릿/POS와 macOS 버전을 Flutter로 운영 중이며, Windows와 모바일 플랫폼(Android 모바일, iOS)은 점진적으로 전환하고 있습니다."
- **수신 모듈을 인터페이스로 분리해 두어서 방식 교체가 쉬웠다고 쓴다.**
  > "최근 실시간 메시지 수신 방식을 MQTT에서 SSE(Server-Sent Events)로 변경했습니다. ServerEventReceiver 인터페이스로 추상화해두었기 때문에 아래와 같이 효율적으로 전환할 수 있었습니다." / "구현체만 교체(MqttEventReceiver → SseEventReceiver)" / "비즈니스 로직은 변경 없음"
- 프린터는 화면·업무 로직과 분리된 계층에 둔다.
  > "Infrastructure 계층에서 순수 기술 구현(프린터, 오디오, 실시간 통신 등)을 제공합니다."

#### (5) 미접수 주문 처리 — 배민외식업광장 공식 가이드

- 아래 세 페이지는 스크립트로 그려지는 페이지라 **[도구 요약 경유]**로만 확인했다. 게시일 표기는 없다.

| 사실 | 원문 | 출처 |
|---|---|---|
| 가게배달: 3분 미접수 자동 취소 | "주문 인입 후, 3분 이내에 접수하지 않으면 주문이 자동으로 취소됩니다." | [가게배달 주문접수](https://ceo.baemin.com/guide/4043) |
| 배민배달(알뜰·한집): 3분 | "※ 주문 인입 후, 3분 이내에 접수하지 않으면 주문이 자동으로 취소됩니다." | [배민배달 주문접수](https://ceo.baemin.com/guide/12158) |
| 배민스토어 픽업: 15분 | "주문 인입 후 15분 경과 시 주문은 자동 취소 처리 되므로 빠른 주문 접수가 필요합니다." | [배민스토어 (픽업) 주문접수 가이드](https://ceo.baemin.com/guide/10598) |
| 취소·거부가 쌓이면 자동 영업 임시중지 | "주문이 2건 이상 취소·거부되면 당일 오후 24시 또는 영업 마감시간까지 자동 영업 임시중지가 돼요." | [배민 데이터 레시피 Vol.1](https://ceo.baemin.com/guide/14464) |
| 주문서 출력 | "가게배달의 경우, 출력물 상단에 '배달'로 표시되고 고객용, 매장용으로 나누어 확인할 수 있습니다." | [가게배달 주문접수](https://ceo.baemin.com/guide/4043) |

- 주의: 배민스토어(15분)는 장보기·쇼핑 상품이라 음식 주문(3분)과 기준이 다르다. 카페 포장 주문에 해당하는 "배민 픽업(음식)" 주문의 자동 취소 시간은 따로 확인하지 못했다.
- **고객 취소 가능 시점**: 위 가이드들에는 가게 쪽 취소 규칙만 있다. 고객 쪽 규칙은 **확인 불가**.

#### (6) 주문접수 프로그램이 꺼져 있을 때 — 토스플레이스의 공식 안내

- 배민이 아니라 토스플레이스가 쓴 안내문이다(토스 포스와 배민 프로그램의 연동 설명).
- 출처: [토스플레이스 – 윈도우 포스에서 배달의민족 주문을 직접 받을 수 있어요](https://tossplace.com/story/windows_baemin), 게시일 2025-05-05. **[원문 확인]**
  > "주문을 받으려면 배민주문접수 PC Lite 프로그램이 켜져 있고, 포스 설정 > 배달 계정 연결에서 '연결완료' 상태로 표시돼야 해요."
- 출처: [토스플레이스 – 12월 18일부터 배달의민족 주문 접수 방식이 수동으로 바뀌어요](https://tossplace.com/story/32363), 게시일 2024-12-11. **[원문 확인]** **당시 기준**이다.
  > "사장님, 배달의민족(이하 배민) 프로그램 정책 변경으로 자동 연동이 불가하여, 24년 12월 18일부터는 주문 연동 방식이 수동으로 변경되었어요."
- 이 두 글은 "다른 회사의 주문접수 프로그램에 기대어 연동하면 그 회사 정책 변경에 따라 연동이 끊길 수 있다"는 사례다. 이 프로젝트는 기존 POS와 연동하지 않으므로 직접 해당하지는 않는다.

---

### 2.2 토스플레이스 (토스 포스, 토스 프론트, 토스오더)

#### (1) 토스 포스가 자사 서버에서 주문을 받는 방식: 확인 불가

- toss.tech와 SLASH 발표 자료에서 "서버 → 포스 주문 전달"을 다룬 글을 찾지 못했다(5장 참고).
- 공개된 것은 **외부 개발사가 토스 포스의 주문 데이터를 받는 방법**이다. 토스 포스 자체가 주문을 받는 방식이 아니다.

#### (2) 외부 연동용 개발자 문서

- 출처: [토스플레이스 개발자 문서 – 토스 POS 연동 시작하기](https://docs.tossplace.com/guide/pos-integration/getting-started.html), 게시일 표기 없음. **[원문 확인]**
  > "Q. 실시간으로 주문 데이터를 받을 수 있나요? A. 네, 두 가지 방법이 있어요. Plugin SDK: 이벤트 리스너로 실시간 데이터 수신 / Open API: 웹훅 이벤트 등록을 통한 실시간 데이터 수신"
  - Plugin SDK는 포스 안에서 도는 플러그인이 포스 프로그램으로부터 이벤트를 받는 구조다(같은 기기 안). Open API 웹훅은 토스플레이스 서버가 외부 개발사 서버로 보내는 구조다 **[다른 구간: 서버 간]**.
- 출처: [웹훅 가이드](https://docs.tossplace.com/reference/open-api/webhook.html), 게시일 표기 없음. **[원문 확인]** **[다른 구간: 서버 간]**

| 항목 | 원문 |
|---|---|
| 전달 보장 수준 | "웹훅은 최소 한 번 전달(at-least-once) 정책으로 전달돼요. 동일 이벤트가 재전송될 수 있으므로 수신 측은 처리에 있어 멱등성을 고려해야 해요." |
| 중복 제거 키 | "웹훅 수신 측은 x-toss-webhook-id를 멱등 키로 사용하여 중복 처리를 방지해야 해요." / "동일 이벤트 전송 재시도 시에 같은 값을 가져요." |
| 반복 실패 시 | "웹훅 전송 실패가 반복되어 전송이 불가능하다고 판단되면, 토스플레이스 서버가 해당 endpoint로의 웹훅 전송을 중단할 수 있어요." |

  - 재시도 횟수와 간격은 문서에 없다.
- 출처: [주문 – 웹훅](https://docs.tossplace.com/reference/open-api/order/order-events.html), 게시일 표기 없음. **[원문 확인]**
  - 주문 상태에 "요청됨 → 수락됨 / 거절됨 / **만료됨**"이 있다.
    > `order.order.expired.v1`: "요청된 주문을 매장에서 일정 시간 내에 수락/거절하지 않아 자동으로 만료 처리되었어요."
  - `order.order.created.v1`만 주문 전체를 담고, 나머지 이벤트는 주문 ID·주문 번호 정도만 담는다([도구 요약 경유]로 확인).

#### (3) 토스오더 픽업주문의 미접수 처리

- 출처: [토스플레이스 – 우리 매장도 모바일로 미리 픽업주문 받아요](https://tossplace.com/story/pickup_order), 게시일 2025-04-08. **[원문 확인]**
  > "포스 화면 상단에 들어온 주문과 픽업 시간이 표시되고, 매장 상황에 따라 '거부'나 '접수'를 눌러 주문을 처리할 수 있어요."

  > "5분 이내에 주문을 수락하지 않으면 자동으로 취소돼요. 접수마감 30초 남았을 때 알림 표시가 뜨고, 마감 시간이 지나면 고객에게 "매장 사정으로 취소해요"라는 알림톡이 가요."
- 필요한 기기([도구 요약 경유]): "토스 포스와 프론트를 함께 사용하는 선불형 매장에서 쓸 수 있는 기능이에요."
- 고객 취소 가능 시점, 주문서 출력 방식은 이 글에 없다. **확인 불가**.

#### (4) 주문을 놓치지 않게 하는 화면 장치 (테이블오더)

- 출처: [토스플레이스 – 테이블오더 주문을 절대 놓치지 않는 3가지 방법](https://www.tossplace.com/story/prevent-tableorder-missing), 게시일 2024-09-04. **[도구 요약 경유]**
- 대상은 매장 안 테이블 주문이다. 원격 결제 주문과는 다른 상품이다. 화면 장치만 참고한다.
  - 알림음 종류를 고를 수 있고 포스마다 다르게 설정할 수 있다.
  - "주문 알림효과는 신규 테이블오더 주문이 들어오면, 해당 테이블이 반짝이는 기능이에요." (확인할 때까지 깜빡임)
  - 테이블오더 주문을 주문서로 출력할 수 있다.

---

### 2.3 스타벅스

#### (1) 한국 (스타벅스 코리아 / 신세계그룹)

- **주문 전달 방식, 누락 방지, 단말 구성: 확인 불가.**
- **고객 취소 범위는 확인됨.**
  - 출처: [신세계그룹 뉴스룸 – 스타벅스, 사이렌 오더 기능 고도화한다](https://www.shinsegaegroupnewsroom.com/starbucks-siren-order-enhancement/), 게시일 2024-12-17. **[원문 확인]**
    > "또한, 매장에서 고객의 주문을 승인하기 전이라면 사이렌 오더 취소도 가능해진다. 주문이 승인되면 즉시 음료가 제조되기 때문에 취소가 제한된다."
  - 적용 시점은 같은 글 기준 2024-12-19부터다([도구 요약 경유]).
  - 이 문장에서 "매장이 주문을 승인하는 단계"가 있다는 것까지는 알 수 있다. 승인을 사람이 누르는지 자동인지는 글에 없다.
- AWS Industry Week 2024에 스타벅스 사이렌오더의 클라우드 전환을 다룬 세션 영상이 있다([YouTube](https://www.youtube.com/watch?v=f2JwgPq7Mko)). 영상이라 내용을 열람하지 못했다. 검색 결과의 소개문에는 매장 전달 구조 언급이 없었다. 근거로 쓰지 않는다.

#### (2) 미국 (Starbucks)

- **확인 불가.** Starbucks가 Mobile Order & Pay 주문을 매장 단말로 보내는 방식을 직접 설명한 기술 글이나 발표 자료를 찾지 못했다. 검색에 나온 것은 언론 보도와 제3자 분석 글이었다(5장).

---

### 2.4 국내 커피 주문·POS 서비스

| 서비스 | 결과 | 시도한 것 |
|---|---|---|
| 메가MGC커피 (메가오더) | **확인 불가** | 웹 검색(공식 이용안내·FAQ). 쿠폰 판매 페이지만 나옴 |
| 컴포즈커피 | **확인 불가** | 웹 검색(공식 FAQ·약관). 앱스토어 소개와 기사만 나옴 |
| 매머드커피 (매머드 익스프레스·매머드 오더) | **확인 불가** | 웹 검색. 공식 자료 없음 |
| 패스오더 (페이타랩) | **확인 불가** | 웹 검색 2회(기술블로그, 사장님 가이드). 공식 자료 없음 |
| 페이히어 | **확인 불가**(전달 방식) | 웹 검색 2회. 공식 블로그·고객센터에는 "주문이 KDS 태블릿에 실시간으로 표시된다" 수준의 기능 소개만 있고 통신 방식은 없음. 해당 페이지를 직접 열지는 않았다 |

이 다섯 서비스는 기술 블로그나 개발자 문서에서 매장 전달 방식을 공개하지 않은 것으로 보인다. 단, 검색 엔진에 잡히지 않는 앱 내 고객센터나 가맹점 전용 매뉴얼에 운영 규칙(자동 취소 시간 등)이 있을 가능성은 남는다.

---

### 2.5 해외 참고

해외 네 곳의 공개 개발자 문서는 모두 **"플랫폼 서버 → POS 회사(연동 개발사) 서버"** 구간을 설명한다. 매장 안 기기가 받는 구간이 아니다. 다만 "받았다는 확인, 재전송, 중복 제거, 제한 시간"의 설계 방식은 같은 문제를 다루므로 참고할 수 있다.

#### (1) Uber Eats

**POS 연동 웹훅 [다른 구간: 서버 간]**
- 출처: [Uber Developers – Eats Webhooks 가이드](https://developer.uber.com/docs/eats/guides/webhooks), [Order Notification 레퍼런스](https://developer.uber.com/docs/eats/references/api/webhooks.orders-notification), 게시일 표기 없음. **[도구 요약 경유]**(직접 내려받기는 404)

| 항목 | 원문 |
|---|---|
| 알림만 보내고 내용은 조회 | "Once a webhook is received, you can pull the full order information using the `resource_href`" |
| 수신 확인 | "Your service should return an `HTTP 200` response code with an empty response body" |
| 재전송 | "The first retry will be sent 10 seconds after the initial event." 이후 30초, 60초, 120초로 늘리며 "until 7 total events were sent without a response." |
| 중복 제거 | `event_id`: "Unique event identifier to ensure that events are only digested once." |
| 순서 | "Events are retried if not acknowledged and their delivery is not guaranteed to be in order." |
| **수락 제한 시간** | "you **must** explicitly POST `/accept_pos_order` or `/deny_pos_order` within 11.5 minutes. Otherwise the order will time out and auto-cancel." |
| 미응답 시 전화 | "a robocall will be triggered if no Accept/Deny is posted after 90 seconds." |

**매장 자동 일시중지**
- 출처: [Uber Eats Merchants – Troubleshooting and integrating new stores](https://merchants.ubereats.com/ar/en/resources/learning-center/store-integration), 게시일 표기 없음. **[도구 요약 경유]**
  > "Restaurant partners have a standard threshold set to two unfulfilled orders before auto-pausing"

  > "an order gets automatically marked as unaccepted after 11.5 minutes."
- 출처: [Uber 블로그 – Automatic pausing for merchants](https://www.uber.com/au/en/blog/automatic-pausing-for-merchants), 게시일 2024-03-06(호주·뉴질랜드 대상). **[도구 요약 경유]**
  > "a store that has been automatically paused will be automatically unpaused by 6:00am the following day"

**매장 태블릿 앱**
- 출처: [Uber Eats Merchant Academy – Accepting orders](https://merchants.ubereats.com/au/en/academy/orders), 게시일 표기 없음. **[도구 요약 경유]**
  > "When your Orders app is open, a sound and a flashing green light alerts you to every new order."

  > "If the app is minimised or in the background, you won't receive orders."
- 프린터: 같은 페이지에 Star Micronics, Epson, "Sumni"(도구가 전한 표기. Sunmi의 오기로 보이나 확인하지 못함) 프린터를 앱 설정에서 연결한다고 안내한다.
- 태블릿 앱이 Uber 서버에서 주문을 받는 통신 방식은 **확인 불가**.

#### (2) DoorDash

**POS 연동 웹훅 [다른 구간: 서버 간]**
- 출처: [DoorDash Developer – Receive orders from DoorDash](https://developer.doordash.com/docs/marketplace/how_to/order_integration), [Orders FAQ](https://developer.doordash.com/docs/marketplace/faq/order), 게시일 표기 없음. **[원문 확인]**

| 항목 | 원문 |
|---|---|
| 즉시 확정 | "Return 200 for an order success, a non 2xx will be treated as an order failure." |
| 나중에 확정 | "If you have received the order, but would like to update the status at a later time, indicate this with a status code of 202." |
| **확정 제한 시간** | "If you do not confirm the order in 3-8 minutes, DoorDash will treat the order as a failure due to an order confirmation timeout." |
| 재시도 | "Doordash will retry orders, order cancellations, and menu callbacks up to 3 times with 0.3s in between if the partner returns a 5xx response status to the initial request." |
| POS 연동 매장은 사람이 수락하지 않는다 | "orders sent from DoorDash to the POS should be auto-confirmed or auto-rejected as part of the integration. Merchants should not have the ability to manually accept or deny orders." |
| 대체 경로 | "In special cases, a store can be set up with Tablet as the fallback protocol in the case that POS order injection fails." |
| 취소 알림 | 별도 웹훅(Order Cancellation Notification)을 DoorDash 쪽에서 설정해 줘야 받는다 |

**매장 태블릿**
- 출처: [DoorDash Help Center – How to Manage Orders on the DoorDash Tablet](https://help.doordash.com/en-us/merchants/article/tablet-order-manager-overview), 게시일 표기 없음. **[원문 확인]**
  > "When a customer places an order, your tablet shows a pop-up notification. How you receive the order depends on whether you use manual confirmation or Auto-confirm."

  > "If you don't confirm right away, you can find the order later in the Needs Action tab."

  > "When Auto-confirm new orders is on, new orders are automatically confirmed, and a Dasher is assigned immediately."
- 태블릿이 DoorDash 서버에서 주문을 받는 통신 방식, 태블릿 수동 확정의 제한 시간은 **확인 불가**.

#### (3) Square

- 출처: [Square Developer – Webhooks overview](https://developer.squareup.com/docs/webhooks/overview), 게시일 표기 없음. **[원문 확인]** **[다른 구간: 서버 간]**
  > "Square resends the event notification for up to 24 hours after the originating event, using exponential backoff to avoid spamming applications. After 24 hours, the notification is discarded and no further retry attempts are made."

  > "Webhooks can be sent more than once. You can bypass the processing of repeated notifications using the idempotency value included as the event_id field in the body of each event notification."

  > "There's no guarantee of the delivery order of event notices."
- 응답 제한 시간은 10초다([도구 요약 경유]).
- Square POS 앱이 온라인 주문을 받는 내부 방식, 미접수 처리는 **확인 불가**. Square 공식 도움말(Order Manager)은 검색 결과로만 보고 직접 열지 않았으므로 근거로 쓰지 않는다.

#### (4) Toast

**개발자용 웹훅 [다른 구간: 서버 간]**
- 출처: [Toast – Adding a webhook subscription (체크리스트)](https://doc.toasttab.com/doc/cookbook/apiWebhookUsageChecklist.html), [Retry support](https://doc.toasttab.com/doc/devguide/apiRetrySupport.html), 게시일 표기 없음. 제목·핵심 구절은 **[원문 확인]**, 전체 문장은 **[도구 요약 경유]**

| 항목 | 원문 |
|---|---|
| **웹훅만 믿지 말고 조회 API를 주기적으로 호출** | "All Toast webhooks have a fallback API." / "Your integration should periodically query the fallback API in case you miss a webhook." |
| 중복 제거 | "If two webhooks have the same event GUID, you must treat them as the same webhook event." |
| 재전송 | "the Toast platform will wait five minutes and then resend the update." 다시 실패하면 10분 뒤 한 번 더. "If the second resend attempt fails, the Toast platform does not send the update again." |

**매장이 오프라인일 때 온라인 주문 (매장 단말 구간에 해당)**
- 출처: [Toast Support – Outages and Disruptions: Toast Online Ordering](https://support.toasttab.com/en/article/Outages-and-Disruptions-Toast-Online-Ordering), 최종 수정 2026-06-30. 핵심 구절 **[원문 확인]**
  > "Toast Online Ordering is unavailable because online orders cannot reach a restaurant that is not connected to the Toast cloud."

  > "If auto-fire is turned on, the system automatically approves and fires any online orders that came in during Offline Mode."
  - 온라인 주문 페이지는 매장이 끊긴 뒤 약 5분 안에 주문 받기를 멈춘다. 그 사이 들어온 주문은 연결이 복구되면 들어온다([도구 요약 경유]).
  - 자동 승인이 꺼져 있으면 복구 후 직원이 대기 주문을 하나씩 승인해야 한다. 5분 안에 승인되지 않은 주문의 손님에게는 메일이 간다([도구 요약 경유]).
- 출처: [Toast Support – Troubleshoot Your Autofire Device](https://support.toasttab.com/article/Troubleshooting-your-Autofire-Device), 최종 수정 2026-09-30. 핵심 구절 **[원문 확인]**
  - 온라인 주문을 자동 승인해 주방으로 보내는 기기를 매장에 1대 지정한다. 이 기기가 5분간 승인을 멈추면 온라인 주문이 일시중지될 수 있다.
    > "The autofire device stopped approving orders for five minutes"
  - 이 기기는 유선(Ethernet)으로 연결한 고정 단말을 쓰라고 안내한다. 무선 연결이나 휴대용 단말은 쓰지 말라고 한다([도구 요약 경유]).
- Toast POS 단말이 Toast 서버에서 주문을 받는 통신 방식은 **확인 불가**.

---

## 3. 서비스 간 공통점 (사실 정리)

여러 출처에서 겹치는 내용만 모았다. 해석은 4장에 둔다.

| 공통점 | 해당 출처 |
|---|---|
| 실시간 알림에는 "신호"만 싣고 주문 내용은 API로 조회하는 구조가 있다 | 배민 2017(주문번호만 MQTT로), 배민 MQTT 시절(Zero payload), Uber Eats(`resource_href`), 토스 웹훅(생성 이벤트 외에는 ID만) |
| 실시간 전달만으로 끝내지 않고 조회를 보조로 둔다 | 배민 2017(폴링을 보조 수단으로), 배민 MQTT 시절(방화벽 때문에 폴링 병행), Toast("fallback API를 주기적으로 조회") |
| 전달은 "한 번 이상"이고, 받는 쪽이 고유 ID로 중복을 거른다 | 토스(`x-toss-webhook-id`, at-least-once 명시), Uber Eats(`event_id`), Square(`event_id`), Toast(event GUID), 배민(이벤트 `id` + commit) |
| 받았다는 확인은 별도 응답으로 한다 | 배민(commitUrl 호출), Uber Eats·DoorDash·Square·토스(HTTP 2xx 응답) |
| 일정 시간 안에 접수하지 않으면 주문이 자동 취소·만료된다 | 배민 3분, 토스오더 5분, Uber Eats 11.5분, DoorDash POS 연동 3~8분, 토스 Open API(`expired` 이벤트) |
| 미접수가 반복되면 매장의 주문 받기를 자동으로 막는다 | 배민(취소·거부 2건 이상), Uber Eats(미처리 2건), Toast(자동 승인 기기 5분 정지) |
| 순서는 보장되지 않는다고 명시하거나, 보장하려고 별도 장치를 둔다 | Uber Eats·Square(보장 안 함), 배민(매장별 Kafka 파티션으로 보장) |

---

## 4. 이 프로젝트에 주는 시사점

사실과 해석을 나눠 적는다. **(해석)** 표시가 붙은 문장은 이 문서 작성자의 풀이이며 출처에 직접 쓰여 있지 않다. 어느 방식을 고를지는 권하지 않는다.

### 4.1 전달 방식 선택 (`realtime-delivery-options.md` 7장 1번)

- **사실**: 배민은 같은 종류의 프로그램(매장 PC 주문접수)에서 짧은 폴링 → MQTT(자체 브로커) → MQTT(AWS IoT) → SSE 순서로 바꿨다고 공개했다. 협의 문서의 ④ → ⑤ → ②에 해당하는 경로다.
- **사실**: 폴링을 버린 이유는 "매장·주문이 늘면서 폴링 요청이 급증해 서버 비용이 올랐다"였다(2017). MQTT를 버린 이유는 "일부 매장 방화벽이 1883/8883 포트를 막아 폴링을 병행해야 했다", "웹뷰에서 연결이 어려웠다"였다(2025).
- **사실**: WebSocket을 고르지 않은 이유로 "매장 → 서버는 이미 REST API로 하고 있어서 단방향이면 충분하다"를 들었다.
- **(해석)** 배민이 폴링에서 겪은 문제는 규모에서 나왔다. 이 프로젝트의 파일럿 규모(매장 수 개~수십 개)에서 같은 문제가 생긴다는 근거는 아니다. 협의 문서 2장 ④의 요청량 계산(100개 매장, 3초 간격 → 약 33 req/s)으로 따로 판단할 일이다.
- **(해석)** MQTT 포트 차단은 ⑤를 검토할 때 확인할 항목이 된다. 관리형 브로커가 443 포트(MQTT over WebSocket 등)를 지원하는지, 파일럿 매장 네트워크가 8883을 막는지는 이 문서에서 확인하지 않았다.
- **(해석)** 이 프로젝트도 매장 → 서버를 REST로 정해 두었다(협의 문서 1장). 배민이 SSE를 고른 전제와 같은 구조다. 다만 배민의 선택 이유에는 "기존 REST 인프라와 웹뷰 지원"이 들어 있고, 이 프로젝트는 수신을 Rust 본체가 맡으므로 웹뷰 제약은 해당하지 않는다.

### 4.2 누락 방지 (요청 문서 3.2~3.4, 설계 원칙 1·2)

- **사실**: 배민은 SSE로 바꾸면서도 표준 기능(`Last-Event-ID`)만 쓰지 않았다. 중요한 이벤트마다 수신 확인 URL을 호출하게 하고, 서버 DB에 확인 여부를 기록한다.
- **사실**: 배민은 미확인 이벤트를 그대로 다시 보내지 않는다. 현재 주문 상태와 대조해서, 이미 접수된 주문의 "신규 주문" 이벤트는 재전송에서 뺀다. 이유는 주문서가 다시 출력되면 안 되기 때문이라고 쓴다.
- **사실**: Toast는 웹훅을 받는 쪽에 "대체 조회 API를 주기적으로 호출하라"고 요구한다. 배민도 MQTT 시절에는 폴링을 병행했다.
- **(해석)** 협의 문서 1.2절의 공통 요구사항(ack, 미확인 주문 조회, 중복 처리 방지)은 배민이 공개한 구조와 같은 종류의 장치다. "어떤 방식을 골라도 이 장치는 필요하다"는 협의 문서의 전제를 뒷받침하는 실제 사례로 쓸 수 있다.
- **(해석)** 배민의 "주문 상태와 대조한 재전송"은 서버 쪽 규칙이다. 이 프로젝트에서는 같은 문제를 매장 프로그램 쪽에서 `orderId` 기준으로 "이미 출력한 주문은 다시 출력하지 않는다"로 풀 수도 있다. 어느 쪽에 둘지는 백엔드와 정할 항목이다.
- **(해석)** 배민 글은 "주문서 출력"을 딱 한 번 처리해야 하는 대표 사례로 든다. 이 프로젝트 설계 원칙 2(한 번만 알리고 한 번만 출력)와 같은 문제의식이다.

### 4.3 서버 증설 시 라우팅 (협의 문서 4장, 7장 5번)

- **사실**: 배민은 "연결 위치 기록"과 "연결된 서버로만 전달"을 검토한 뒤 "모든 SSE 서버가 메시지를 받는 방식(Kafka)"을 골랐다. 지연이 수십 ms 늘지만 정확성이 더 중요하다고 판단했다고 쓴다.
- **사실**: 서버 재배포 때 모든 매장이 동시에 재접속해 CPU가 치솟는 문제를 겪었고, 재접속 시점을 무작위로 흩어서 해결했다.
- **(해석)** 협의 문서 4장의 "Pub/Sub 방송"에 해당하는 선택이다. 다만 배민은 메시지를 보관하는 브로커(Kafka)를 썼다. 협의 문서가 예로 든 Redis Pub/Sub는 끊긴 구독자에게 간 메시지가 사라지므로(기존 리서치 6장) 성격이 다르다.
- **(해석)** ①② 방식을 고르면 매장 프로그램의 재연결 간격에 무작위 지연을 넣을지 정해야 한다. 파일럿 규모에서는 문제가 드러나지 않을 수 있다.

### 4.4 미접수 주문과 매장 꺼짐 (요청 문서에 넣을지 검토할 항목)

- **사실**: 확인된 모든 서비스가 "일정 시간 안에 접수하지 않으면 자동 취소"를 둔다(3분~11.5분). 배민·Uber Eats·Toast는 미접수가 반복되거나 단말이 응답하지 않으면 매장의 주문 받기를 자동으로 막는다.
- **사실**: 배민은 폴링 요청이나 SSE 하트비트를 "매장 단말이 살아 있다"는 신호로 썼다.
- **사실**: Uber Eats 태블릿 앱은 앱이 화면 앞에 떠 있지 않으면 주문을 받지 못한다고 안내한다. Toast는 자동 승인 기기를 유선 연결 고정 단말로 두라고 안내한다.
- **(해석)** 이 프로젝트는 결제가 끝난 주문을 받는다. 매장 프로그램이 꺼져 있거나 점원이 접수하지 않을 때 주문을 어떻게 할지(자동 취소·환불, 매장 주문 차단, 점주 알림)는 백엔드·앱 팀 범위의 정책이다. 현재 미결정 사항 표에는 없다. 회의에서 누가 정할지 확인할 만한 항목이다.
- **(해석)** 어느 전달 방식을 고르든, 연결 상태(또는 폴링 요청)를 "매장이 주문을 받을 수 있는 상태인가"의 신호로 쓸 수 있다. 서버가 이 신호로 고객 앱의 주문 가능 여부를 바꿀지는 백엔드와 정할 일이다.

### 4.5 고객 취소 범위

- **사실**: 스타벅스 코리아는 "매장이 주문을 승인하기 전까지" 고객 취소를 허용한다(2024-12-19부터). 그전에는 취소 기능이 없었다는 것은 언론 보도로만 확인했다(근거에서 제외).
- **(해석)** 고객 취소를 허용하면 "취소됨" 이벤트도 매장 단말에 누락 없이 전달되어야 한다. 취소 이벤트가 접수 버튼을 누르는 순간과 겹칠 때의 처리(서버가 접수 요청을 거절하는지)는 API 협의 항목이 된다.

### 4.6 수신 모듈 분리 (협의 문서 5장)

- **사실**: 배민은 수신부를 `ServerEventReceiver` 인터페이스로 분리해 두어서 MQTT → SSE 전환 때 구현체만 바꿨다고 쓴다.
- **(해석)** 협의 문서 5장의 "방식 교체 시 수신 모듈만 교체"와 같은 구조다. 파일럿은 단순한 방식으로 시작하고 나중에 바꾼다는 선택지(7장 2번)가 실제로 쓰인 사례로 볼 수 있다. 다만 배민 글은 클라이언트 쪽 전환 비용만 말한다. 서버 쪽 전환 비용은 따로 봐야 한다.

---

## 5. 확인 불가 목록과 시도한 것

### 5.1 확인 불가

1. **토스 포스가 토스플레이스 서버에서 주문(토스오더·배달 주문)을 받는 통신 방식.** 시도: 웹 검색 3회(toss.tech, SLASH, "토스플레이스 포스 실시간 아키텍처"), 개발자 문서(docs.tossplace.com) 열람. SLASH24 발표(오프라인 결제)는 결제 단말과 포스 사이 연결 얘기라 구간이 다르다. 발표 자료 PDF는 열지 않았다.
2. **스타벅스 사이렌오더(한국)의 매장 전달 방식·단말 구성.** 시도: 웹 검색 3회. AWS Industry Week 2024 세션 영상은 영상이라 열람하지 못했다.
3. **Starbucks(미국) Mobile Order & Pay의 매장 전달 방식.** 시도: 웹 검색 3회. 공식 기술 글을 찾지 못했다.
4. **메가MGC커피, 컴포즈커피, 매머드커피, 패스오더, 페이히어의 전달 방식과 운영 규칙.** 시도: 웹 검색 6회. 페이히어 고객센터(help-center.payhere.in)와 블로그는 검색 결과로만 보고 직접 열지 않았다.
5. **Uber Eats·DoorDash 태블릿 앱, Square·Toast POS가 자사 서버에서 주문을 받는 내부 방식.** 각사 엔지니어링 블로그 검색에서 해당 글을 찾지 못했다.
6. **고객 취소 허용 범위**(배민, 토스오더, 해외 서비스). 배민 가이드에는 가게 쪽 취소 규칙만 있다. DoorDash FAQ는 취소 정책을 별도 페이지로 안내하는데 그 페이지는 열지 않았다.
7. **배민 음식 포장(픽업) 주문의 자동 취소 시간.** 가게배달·배민배달(3분), 배민스토어 픽업(15분)만 확인했다.
8. **배민 주문접수 프로그램의 현재 Windows 구현 기술과 프린터 출력 방식.** 2019년 글의 태그(`#Delphi`)와 2025년 글의 "Windows는 Flutter로 점진 전환 중"까지만 확인했다.
9. **배민 SSE 전환 후 남아 있는 조회 로직의 범위**(재시작 시 주문 목록 조회 방식 등). 글에 설명이 없다.
10. **배민 SSE의 하트비트 주기, 메시지 이력 보관 기간, 세션 지속 시간.** 글에 수치가 없다.
11. **토스 웹훅의 재시도 횟수·간격, 토스오더 외 주문의 자동 취소 시간.** 문서에 없다.
12. **Uber Eats·DoorDash 태블릿 수동 접수의 제한 시간.** Uber는 11.5분(POS 연동 기준)만 확인했다.
13. **배민 주문접수채널팀·중계시스템팀 소개 페이지**(woowahan.oopy.io). 접속 실패(DNS 조회 실패)로 열지 못했다.

### 5.2 열지 못했거나 신뢰가 낮아 뺀 자료

| 자료 | 뺀 이유 |
|---|---|
| woowahan.oopy.io 팀 소개 2건 | 접속 실패. 검색 결과 요약으로만 봤다 |
| Speaker Deck 「MQTT 를 이용한 주문 시스템 개선」 | 개인 발표 자료(2차 자료). 배민 공식 자료가 아니다 |
| 우아한형제들 PM 블로그(woowahanpm.oopy.io) | 공식 기술 블로그가 아니다. 열지 않았다 |
| 배민 「실시간 서비스 경험기(배달운영시스템)」([techblog](https://techblog.woowahan.com/2547/), 2017-09-12) | 공식 글이지만 **다른 구간**이다. 라이더 관제·배차 시스템(BROS)의 WebSocket 얘기라 매장 전달 근거로 쓰지 않았다. 참고로 "이벤트 유실에 대비해 2분마다 전체 데이터를 다시 보내 보정했다"는 내용이 있다 |
| AWS 기술 블로그 「우아한형제들 실외배달 로봇 AWS IoT Core」 | 배달 로봇 얘기(다른 구간). 열지 않았다 |
| 스타벅스 사이렌오더 취소 기능 관련 언론 기사(TV리포트, 이코노미스트, 인사이트 등) | 뉴스 기사(2차 자료). 신세계그룹 뉴스룸 원문으로 대체했다 |
| Starbucks 관련 언론·분석 글(GeekWire, QSR Magazine, Hospitality Tech, Medium 등) | 2차 자료. Smart Queue 등은 제조 순서 얘기라 전달 구간도 아니다 |
| about.starbucks.com의 Smart Queue 언급 페이지 | 공식이지만 검색 결과로만 봤고, 제조 순서 얘기라 범위 밖이다 |
| Hookdeck, Deliverect, Doshii, Deliverit, Bopple 등의 연동 안내 | 제3자(연동 대행사) 문서. Uber의 "POS 무응답 90초 뒤 태블릿으로 넘어감, 태블릿 10분" 같은 수치가 있었지만 Uber 공식 문서에서 확인하지 못해 뺐다 |
| Square·Toast 커뮤니티/개발자 포럼 글 | 커뮤니티 글. 중복 전송 사례 등이 있었지만 뺐다 |
| Square 공식 도움말(Order Manager, 자동 출력) | 공식이지만 검색 결과로만 봤다. 직접 열지 않아 근거로 쓰지 않았다 |
| 네이버 주문 매뉴얼(PDF) | 조사 대상 목록에 없고, PDF 본문을 읽지 못했다 |
| 구인 공고(원티드 등) | 추정 근거로 쓰지 않는다는 기준에 따라 제외 |
| velog 등 SLASH24 후기 | 제3자 후기(2차 자료) |

### 5.3 인용 확인 수준 요약

- **[원문 확인]**: 우아한형제들 기술블로그 4건, 토스플레이스 개발자 문서 3건, 토스플레이스 공식 안내 3건(pickup_order, windows_baemin, 32363), 신세계그룹 뉴스룸, DoorDash 개발자 문서 2건과 태블릿 도움말, Square 웹훅 문서, Toast 문서의 핵심 구절.
- **[도구 요약 경유]**: 배민외식업광장 가이드 4건, Uber 문서 5건, Toast 문서의 일부 문장, 토스플레이스 테이블오더 안내. 회의 자료에 숫자(3분, 11.5분 등)를 옮기기 전에 링크를 열어 확인하는 것이 안전하다.

---

## 6. 출처 목록 (접근일 모두 2026-11-16)

### 배달의민족 (우아한형제들)
- 우아한형제들 기술블로그 – MQTT 적용을 통한 중계시스템 개선 (2017-08-11): https://techblog.woowahan.com/2540/
- 우아한형제들 기술블로그 – Dll을 이용하여 배달대행 주문정보 연동 (2019-06-27): https://techblog.woowahan.com/2635/
- 우아한형제들 기술블로그 – Server-Sent Events로 실시간 알림 전달하기 (2025-10-24, 수정 2026-01-29): https://techblog.woowahan.com/23199/
- 우아한형제들 기술블로그 – 배달의민족 주문접수 채널에 Flutter를 도입하며 고민한 것 (2025-12-16, 수정 2026-02-03): https://techblog.woowahan.com/24337/
- 배민외식업광장 – 가게배달 주문접수 (게시일 표기 없음): https://ceo.baemin.com/guide/4043
- 배민외식업광장 – 배민배달(알뜰·한집) 주문접수 (게시일 표기 없음): https://ceo.baemin.com/guide/12158
- 배민외식업광장 – 배민스토어 (픽업) 주문접수 가이드 (게시일 표기 없음): https://ceo.baemin.com/guide/10598
- 배민외식업광장 – [배민 데이터 레시피 Vol.1] 우리 가게의 주문 접수, 데이터로 관리해요! (게시일 표기 없음): https://ceo.baemin.com/guide/14464

### 토스플레이스
- 토스플레이스 개발자 문서 – 토스 POS 연동 시작하기: https://docs.tossplace.com/guide/pos-integration/getting-started.html
- 토스플레이스 개발자 문서 – Open API 소개: https://docs.tossplace.com/guide/pos-integration/open-api/intro.html
- 토스플레이스 개발자 문서 – 웹훅 가이드: https://docs.tossplace.com/reference/open-api/webhook.html
- 토스플레이스 개발자 문서 – 주문 웹훅: https://docs.tossplace.com/reference/open-api/order/order-events.html
- 토스플레이스 개발자 문서 – 주문 상태 변경: https://docs.tossplace.com/reference/open-api/order/order-state-methods.html
- 토스플레이스 개발자 문서 – Plugin SDK Websocket: https://docs.tossplace.com/reference/plugin-sdk/pos/websocket.html
- 토스플레이스 – 우리 매장도 모바일로 미리 픽업주문 받아요 (2025-04-08): https://tossplace.com/story/pickup_order
- 토스플레이스 – 매장 밖에서도 주문하는 토스 오더, 드디어 정식 출시 (2024-02-29): https://tossplace.com/story/toss-order
- 토스플레이스 – 테이블오더 주문을 절대 놓치지 않는 3가지 방법 (2024-09-04): https://www.tossplace.com/story/prevent-tableorder-missing
- 토스플레이스 – 윈도우 포스에서 배달의민족 주문을 직접 받을 수 있어요 (2025-05-05): https://tossplace.com/story/windows_baemin
- 토스플레이스 – 12월 18일부터 배달의민족 주문 접수 방식이 수동으로 바뀌어요 (2024-12-11): https://tossplace.com/story/32363

### 스타벅스
- 신세계그룹 뉴스룸 – 스타벅스, 사이렌 오더 기능 고도화한다 (2024-12-17): https://www.shinsegaegroupnewsroom.com/starbucks-siren-order-enhancement/
- (열람 못 함, 근거 아님) AWS Industry Week 2024 세션 영상: https://www.youtube.com/watch?v=f2JwgPq7Mko

### Uber Eats
- Uber Developers – Eats Webhooks 가이드: https://developer.uber.com/docs/eats/guides/webhooks
- Uber Developers – Order Notification 웹훅 레퍼런스: https://developer.uber.com/docs/eats/references/api/webhooks.orders-notification
- Uber Eats Merchants – Troubleshooting and integrating new stores: https://merchants.ubereats.com/ar/en/resources/learning-center/store-integration
- Uber 블로그 – Automatic pausing for merchants (2024-03-06): https://www.uber.com/au/en/blog/automatic-pausing-for-merchants
- Uber Eats Merchant Academy – Accepting orders: https://merchants.ubereats.com/au/en/academy/orders

### DoorDash
- DoorDash Developer – Receive orders from DoorDash: https://developer.doordash.com/docs/marketplace/how_to/order_integration
- DoorDash Developer – Orders FAQ: https://developer.doordash.com/docs/marketplace/faq/order
- DoorDash Help Center – How to Manage Orders on the DoorDash Tablet: https://help.doordash.com/en-us/merchants/article/tablet-order-manager-overview

### Square
- Square Developer – Webhooks overview: https://developer.squareup.com/docs/webhooks/overview

### Toast
- Toast Developer Guide – Adding a webhook subscription (체크리스트): https://doc.toasttab.com/doc/cookbook/apiWebhookUsageChecklist.html
- Toast Developer Guide – Retry support: https://doc.toasttab.com/doc/devguide/apiRetrySupport.html
- Toast Support – Outages and Disruptions: Toast Online Ordering (최종 수정 2026-06-30): https://support.toasttab.com/en/article/Outages-and-Disruptions-Toast-Online-Ordering
- Toast Support – Troubleshoot Your Autofire Device (최종 수정 2026-09-30): https://support.toasttab.com/article/Troubleshooting-your-Autofire-Device
