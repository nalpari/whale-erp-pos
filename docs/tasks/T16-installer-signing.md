# T16. 설치 파일 · 코드 서명

- **출처**: 화면정의서에 없음. `docs/tasks/README.md` "목록에 없는 일"
- **선행 태스크**: T00
- **크기(추정)**: 중 (인증서 구매 · 발급 기간은 별도)
- **관련 문의**: 없음 (인증서 비용은 대표님 확인 필요)

## 목표

매장 PC에 설치할 정식 설치 파일을 만든다. 지금은 서명이 없어 "Windows의 PC 보호" 경고가 뜬다.

## 알고 있는 것

- 지금은 Linux에서 테스트용 `-setup.exe`만 만든다. 운영 배포용 설치 파일은 Windows에서 만든다 (`AGENTS.md` "Windows 설치 파일 만들기").
- 기술 리서치(`docs/research/store-order-receiver-tech-research.md`, 2026-11-12 기준): EV 인증서로도 SmartScreen 경고를 바로 없앨 수 없다. Microsoft Artifact Signing은 한국 "조직"이 대상이다. 스펙 단계에서 공식 문서로 다시 확인한다.
- 앱 식별자 `com.whale.pickuporder.dev`는 임시값이다. 바꾸면 앱 데이터 폴더(자동 로그인 토큰, 프린터 설정 파일)가 달라지므로 첫 정식 배포 전에 정한다.

## 정해야 하는 것 (스펙 단계)

- 서명 방법과 인증서 (비용, 발급 주체: 회사 명의).
- 설치 형식 (`.msi` / `-setup.exe`), WebView2 설치 방식.
- 정식 앱 식별자.
- Windows 빌드를 어디서 할지 (Windows PC / CI).

## 완료 기준

- Windows에서 서명된 설치 파일을 만들 수 있다.
- 매장 PC에 설치 · 제거 · 다시 설치가 된다.
- 정식 앱 식별자가 정해졌다.
