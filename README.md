# 픽업오더 주문접수

고객 앱에서 결제가 끝난 픽업 주문을 매장 POS PC(Windows)에서 받아 처리하는 설치형 프로그램입니다.
**알림 → 접수 / 취소 → 주문서 출력 → 제조완료 → 픽업완료**까지 한 화면에서 처리합니다.

> 지금은 모든 서버 통신을 **앱 안의 모의 서버**로 대신합니다. 실제 API와 실시간 전달 방식은 백엔드와 협의 중이며, 정해지면 `src/shared/api/`의 모의 구현을 실제 구현으로 바꿉니다.

## 기능

| 영역          | 내용                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------- |
| 로그인        | 점포번호 계정(점포코드 + 매장 프로그램 비밀번호, 자동 로그인) · 웨일ERP 계정                             |
| 주문접수      | 새 주문 알림음(30초 반복), 접수 · 취소(사유 선택) · 제조완료 · 픽업완료(5초 되돌리기), 주문받기 ON/OFF   |
| 주문 동기화   | 재연결 · 재시작 때 놓친 주문 다시 받기, 같은 주문 · 이벤트 중복 처리 방지, 연결 끊김 띠                  |
| 바탕화면 위젯 | 항상 위에 뜨는 작은 창에서 주문 확인 · 처리                                                              |
| 주문내역      | 오늘 · 어제 · 이번 달 · 최근 한 달, 상태 탭, 검색(휴대폰 끝 4자리 · 픽업번호 · 주문번호), 결제 정보 상세 |
| 출력          | 접수 때 주문서 자동 출력, 주문서 재출력 · 영수증(미리보기), 출력 실패 띠 · 「미출력」 표시 · 다시 인쇄   |
| 매장 설정     | 매장정보, 메뉴품절(일시품절 · 숨김), AI챗봇 인기메뉴(최대 5개)                                           |
| 환경설정      | 프린터 3대(용도 · 용지 폭 · 시험 인쇄), 위젯 · 알림음 크기, 로그 확인                                    |

## 기술 스택

- **데스크톱**: [Tauri v2](https://v2.tauri.app/) (Rust)
- **화면**: React 19 + TypeScript(strict) + Vite + Tailwind CSS 4, 화면 파일은 설치 파일에 내장
- **테스트**: Vitest + React Testing Library, `cargo test`
- **검사**: ESLint · Prettier, rustfmt · clippy
- **지원 OS**: Windows 10 이상 (개발은 Linux · macOS에서도 가능)
- **입력**: 터치스크린 우선, 최소 창 크기 1024 × 768

## 시작하기

준비물: Node 22.12 이상의 22.x · 24.x · 26 이상, pnpm, Rust stable(rustup), 그리고 OS별 Tauri 준비물([Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)).

```bash
pnpm install
pnpm tauri dev        # 데스크톱 앱으로 실행
pnpm dev              # 화면만 브라우저로 실행 (http://localhost:1420)
```

Linux KDE Wayland에서는 위젯 위치 · 항상 위가 무시되므로 X11로 켭니다.

```bash
GDK_BACKEND=x11 pnpm tauri dev
```

### 모의 서버 계정

| 계정          | 입력                                                              |
| ------------- | ----------------------------------------------------------------- |
| 웨일ERP 계정  | 아이디 `master-demo` · 비밀번호 `demo1234!` · 점포코드 `ST000001` |
| 점포번호 계정 | 점포코드 `ST000001` · 비밀번호 `1234`                             |

### 개발 모드 전용 도구

- **왼쪽 아래 가상 주문 패널**: [5초 뒤 주문]으로 테스트 주문을 넣고, [전체 주문 삭제]로 비웁니다.
- **오른쪽 아래 [출력 미리보기]**: 개발 모드에서는 실제 프린터 대신 주문서 · 영수증을 종이 모양으로 보여 줍니다. 실제 출력은 설치 파일(운영 빌드)로 확인합니다.

두 도구는 운영 빌드에 들어가지 않습니다.

## 명령어

| 명령                                          | 하는 일                          |
| --------------------------------------------- | -------------------------------- |
| `pnpm lint`                                   | ESLint (경고도 실패)             |
| `pnpm typecheck`                              | TypeScript 타입 검사             |
| `pnpm format` / `pnpm format:check`           | Prettier 정리 / 검사             |
| `pnpm test`                                   | Vitest 한 번 실행                |
| `pnpm build`                                  | 타입 검사 후 화면 빌드 (`dist/`) |
| `pnpm tauri build`                            | 설치 파일 빌드 (Windows에서)     |
| `cd src-tauri && cargo fmt --check`           | Rust 서식 검사                   |
| `cd src-tauri && cargo clippy -- -D warnings` | Rust 정적 검사 (경고도 실패)     |
| `cd src-tauri && cargo test`                  | Rust 테스트                      |

### Linux에서 Windows 테스트용 설치 파일 만들기

운영 배포용 설치 파일은 Windows에서 만듭니다. 테스트용 `-setup.exe`(서명 없음)는 Linux에서도 만들 수 있습니다.

```bash
sudo apt install nsis lld llvm clang
rustup target add x86_64-pc-windows-msvc
cargo install --locked cargo-xwin
pnpm tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc
# → src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/
```

## 구조

```
src/
  app/              앱 진입점, 모의 서버 연결
  features/<기능>/   화면 기능별 폴더 (order-board, order-history, print-forms, ...)
  shared/           여러 기능이 같이 쓰는 것 (api, orders, printer, sound, ui, log, session)
src-tauri/
  src/              Rust: 프린터 출력(GDI), 프린터 설정, 자동 로그인 토큰, 로그, 창 · 시스템
  icons/            앱 아이콘 (원본: icon-source/app-icon.svg)
```

## 설계 원칙

1. **주문 누락 0건**: 실시간 수신만 믿지 않고, 재연결 · 재시작 때 미확인 주문을 다시 조회합니다.
2. **중복 처리 방지**: 같은 주문 · 이벤트가 두 번 와도 한 번만 알리고 한 번만 출력합니다.
3. **피크타임 기준**: 주문이 몰려도 화면 · 알림 · 출력이 밀리지 않게 합니다.
4. **바쁜 점원 기준**: 큰 글씨, 적은 터치, 확실한 알림음.
5. **며칠씩 켜 두는 PC**: 연결 끊김 뒤 복구, 토큰 만료, 메모리 누수를 고려합니다.

## 개인정보

로그와 오류 문구에는 고객 이름 · 연락처 · 카드 정보 · 비밀번호를 남기지 않습니다. 주문은 `orderId`로만 기록하고, 로그는 `src/shared/log/`의 함수로만 남깁니다.
