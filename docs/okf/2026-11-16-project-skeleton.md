---
type: Task Report
title: T00. 프로젝트 골격 (Tauri v2 + Vite + React)
description: Tauri v2 + Vite + React 프로젝트를 만들고 검사 · 테스트 · 빌드 명령을 정한다.
tags: [project-skeleton, tauri, vite, react, tooling]
status: stable
generated:
  by: claude-code/claude-opus-5-5
  at: 2026-11-16T15:54:00+09:00
sources:
  - id: task
    resource: plane:WHALEERPPO-1
    title: T00. 프로젝트 골격 (Tauri v2 + Vite + React)
  - id: rules
    resource: /AGENTS.md
    title: 확정 사항, 개발 규칙, 싱글 콘솔 오케스트레이션
  - id: ui
    resource: /docs/proposals/ui-delivery-options.md
    title: 화면 배포 방식 (A-2 화면 내장으로 결정)
verified:
  - by: human:yjnoh
    at: 2026-11-16T16:18:00+09:00
---

# 목표

모든 태스크의 바탕이 될 Tauri v2 + Vite + React + TypeScript 프로젝트를 만든다.[^task]

완료 기준 (지시서 기준):

1. `pnpm install` 성공
2. 샘플 테스트 1개 `pnpm test` 통과
3. `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` 통과
4. `pnpm dev`로 화면이 뜬다
5. Rust 검사(`cargo fmt --check`, `cargo clippy`, 가능하면 빌드). 시스템 패키지가 없으면 "안 됨(이유)"
6. Windows 설치 파일 빌드는 사용자 Windows 확인 항목으로 남긴다
7. `AGENTS.md` "기술 스택 / 명령어" 갱신

# 작업 내용

- `create-tauri-app` 4.7.5의 `react-ts` 템플릿으로 Tauri v2 + Vite + React + TypeScript 프로젝트를 만들었다. 화면은 "픽업오더 주문접수" 제목 하나뿐이다.
- 템플릿 예제(`tauri-plugin-opener`, `greet` 명령, 예제 CSS · 이미지)를 걷어냈다.
- 검사 · 정리 도구(ESLint + Prettier, `any` 금지), Tailwind CSS, 테스트 도구(Vitest + React Testing Library + jsdom)를 붙이고 샘플 테스트 1개를 넣었다.
- `package.json` 스크립트(dev, build, tauri, lint, format, format:check, typecheck, test)를 만들고 `AGENTS.md` "기술 스택 / 명령어"에 명령어 · 주요 버전 · ① 검증 순서를 적었다.

# 작업 방법

- 진행: 지휘 세션 `pos-boss` → 작업 세션 `t00-project-skeleton-0d` (사용자가 `pos-T00` 대신 자동 이름 그대로 쓰기로 함)
- 워크트리 · 브랜치: `~/.whale-smart-pos-worktrees/T00-project-skeleton`, `feature/WHALEERPPO-1-project-skeleton`
- 접근: 공식 템플릿으로 시작해 예제를 걷어내고 허용 목록의 도구만 붙였다. 버전 · 설치 방법은 공식 문서와 npm registry로 확인했다.
- 쓴 스킬 · 도구: `superpowers:requesting-code-review`(②), `pr-review-toolkit:review-pr`(③, code-reviewer · comment-analyzer · pr-test-analyzer)
- 시도했다 버린 방법: `eslint-plugin-react-refresh` 0.5.8은 배포된 지 하루라 pnpm 최소 배포 기간 정책에 걸렸다. pnpm이 자동으로 만든 예외 파일(`pnpm-workspace.yaml`)을 지우고 0.5.7로 정확히 고정했다. 정책을 우회하지 않았다.

# 변경 파일

- `.gitignore`: Node · Vite · Tauri 산출물 항목 덧붙임
- `AGENTS.md`: "기술 스택 / 명령어" 절만 (명령어, 주요 버전, ① 순서, Rust 검사 미실행 기록)
- 화면: `package.json`, `pnpm-lock.yaml`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.vscode/extensions.json`, `public/tauri.svg`, `src/App.tsx`, `src/App.test.tsx`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/test/setup.ts`
- Rust: `src-tauri/` (`Cargo.toml`, `Cargo.lock`, `build.rs`, `.gitignore`, `tauri.conf.json`, `capabilities/default.json`, `src/main.rs`, `src/lib.rs`, `icons/` 16개)

# 검증

지휘 세션이 2026-11-16 16:01에 워크트리에서 직접 실행했다.

- `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test`, `pnpm build`: 모두 exit 0. 테스트 1개 통과.
- `pnpm-workspace.yaml` 없음 확인, `package.json` 의존성이 허용 목록 안인지 확인, `tauri.conf.json`의 productName · identifier 확인, capability가 `core:default`뿐인지 확인.
- `pnpm dev`: 작업 세션이 curl로 `<title>` 확인. 지휘 세션은 직접 띄워 보지 않았다.
- Rust 검사: 처음에는 Linux 시스템 패키지와 rustfmt · clippy가 없어 돌리지 못했다. 사용자가 개발 환경을 설치한 뒤(히스토리 참고) 지휘 세션이 16:13에 직접 실행: `cargo check` · `cargo fmt --check` · `cargo clippy -- -D warnings` · `cargo test`(테스트 0개) 모두 exit 0. 화면 쪽 5종도 다시 모두 exit 0.
- `pnpm tauri dev`: 작업 세션이 X11 백엔드(`GDK_BACKEND=x11`)로 띄워 창 제목 · 화면 제목을 확인하고 종료했다. Wayland 기본 백엔드로는 띄워 보지 않았다.
- Windows 설치 파일 빌드: 사용자 Windows 확인 필요.
- 리뷰: ② 지적 8건 → 고침 3 · 보류 5, ③ 지적 10건 → 고침 8 · 보류 2 (히스토리 참고).

# 결정 사항

- 스택 Tauri v2 + Vite + React, 화면 내장 방식, Windows 10 이상: 사용자 결정 (2026-11-16)[^rules][^ui]
- 패키지 매니저 pnpm, Linux에서 화면 개발 · Windows에서 빌드: 사용자 결정 (2026-11-16)[^rules]
- 앱 식별자 `com.whale.pickuporder.dev`: 임시값, 사용자 결정 (2026-11-16). 바꾸면 앱 데이터 폴더와 WebView 저장 폴더가 바뀌어 저장한 로그인 정보 · 설정을 잃는다(Tauri 공식 문서). 첫 실사용 배포 전에 정식값으로 정해야 한다.
- TypeScript `~6.0.3` 고정: typescript-eslint 8.72.2의 peer 조건이 6.1 미만이다.
- Rust 버전을 고정하지 않음(`rust-toolchain` 파일 없음, rustup 최신 stable): 사용자 결정 (2026-11-16)
- `@types/node`를 넣지 않음: 허용 목록 밖. `vite.config.ts`는 템플릿처럼 `@ts-expect-error`로 처리했다.

# 남은 일 / 위험

- 에이전트 세션의 비대화형 셸에서는 `~/.bashrc`가 앞부분에서 끝나 `~/.cargo/env`를 읽지 않아 배포판 cargo가 먼저 잡힐 수 있다. 새 터미널에서 연 세션은 PATH를 물려받아 괜찮을 것으로 보이나 확인하지 않았다. `AGENTS.md`에 PATH 대처를 적었다.
- Windows 확인 필요: `pnpm tauri dev`, Rust 검사 3종, `pnpm tauri build`, **한글 productName으로 만든 설치 파일 · 실행 파일 · 바로가기가 정상인지** (미확인).
- 다음 태스크로 넘김: 정식 identifier, `csp: null` 제한(백엔드 통신 전), `packageManager` · `engines` 필드, 창 크기(지금 템플릿 기본 800×600 → T01에서 1280×800), 템플릿 기본 아이콘 · favicon.
- 리뷰 보류 항목: `serde` · `serde_json` · `@tauri-apps/api`가 아직 안 쓰임, `eslint.config.js`의 `// @ts-check`가 CLI 타입 검사 대상이 아님, 테스트 참고 2건(창 제목 · `#root` 가드).

# 히스토리

- 2026-11-16T15:36+09:00 워크트리 생성 (`main` 2f52575 기준)
- 2026-11-16T15:44+09:00 규칙 커밋 `2a45e5a` 뒤 워크트리를 최신 `main`으로 맞춤 (fast-forward)
- 2026-11-16T15:49+09:00 사용자가 작업 세션을 엶. 이름은 `t00-project-skeleton-0d` 그대로 쓰기로 함 (A-2). 식별자 임시값 결정 (B-2), 지시서 승인 (C-1)
- 2026-11-16T15:50+09:00 지시서 전달 (pos-boss → t00-project-skeleton-0d)
- 2026-11-16T15:51+09:00 Plane WHALEERPPO-1 상태를 In Progress로 바꿈 (사용자 요청)
- 2026-11-16T15:54+09:00 OKF 규칙에 "작업 내용 · 작업 방법 · 히스토리" 추가 (사용자 결정), 이 보고서 초안 작성. 작업 세션에 `docs/okf/`를 건드리지 말라고 알림
- 2026-11-16T16:01+09:00 작업 세션 완료 보고. ② 지적 8건 → 고침 3 · 보류 5, ③ 지적 10건 → 고침 8 · 보류 2. Rust 검사는 시스템 패키지 없어 못 돌림
- 2026-11-16T16:01+09:00 지휘 세션이 lint · typecheck · format:check · test · build를 직접 실행해 모두 통과 확인, diff · 설정 확인
- 2026-11-16T16:05+09:00 사용자 결정: Linux 패키지 · rustup을 깔고 Rust 검사를 먼저 돌린 뒤 커밋 (A-2). 머지는 로컬에서 main에 바로 (B-1)
- 2026-11-16T16:08+09:00 사용자가 Linux 개발 환경 설치 완료: apt로 Tauri 시스템 패키지(webkit2gtk-4.1 2.52.6 등) → rustup 1.29.3 공식 스크립트 → stable 툴체인(rustc · cargo 1.100.0) + rustfmt · clippy. 배포판 Rust 1.93.1은 남겨 둠. 지휘 세션이 `which cargo`가 `~/.cargo/bin`을 가리키는 것 확인
- 2026-11-16T16:09+09:00 추가 지시 전달: Rust 검사 4종, `pnpm tauri dev`, `AGENTS.md`에 Linux 개발 환경 준비 절차 기록
- 2026-11-16T16:12+09:00 작업 세션 보고: Rust 검사 4종 통과(clippy 경고 0), `pnpm tauri dev` 창 확인, `AGENTS.md`에 개발 환경 준비(Linux, Windows 미확인) 추가. Rust 코드는 고치지 않아 ② 리뷰는 생략
- 2026-11-16T16:13+09:00 지휘 세션이 Rust 검사 4종과 화면 쪽 5종을 직접 실행해 모두 통과 확인
- 2026-11-16T16:14+09:00 사용자가 작업 세션에서 직접 답함: Rust 버전 고정 안 함, `~/.bashrc`의 cargo 설정은 사용자가 직접 확인, Windows 확인은 지금 못 함. 작업 세션이 `AGENTS.md` Rust 행에 결정을 적음 (지휘 세션이 diff 확인)
- 2026-11-16T16:15+09:00 사용자 "커밋해" → 최신 `main`(2e5fab3)을 fast-forward로 합친 뒤 골격 커밋 `1f7845c`, 이어서 이 보고서 커밋, 로컬 `main`에 fast-forward 머지
- 2026-11-16T16:18+09:00 사용자 승인 → status stable. Plane WHALEERPPO-1 Done

[^task]: Plane WHALEERPPO-1
[^rules]: `AGENTS.md` 확정 사항 · 개발 규칙
[^ui]: `docs/proposals/ui-delivery-options.md`
