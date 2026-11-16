# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

# Claude Code 전용 규칙

> 공용 규칙은 `AGENTS.md`에 있다. 프로젝트 규칙을 바꿀 때는 `AGENTS.md`를 고치고, 이 파일에는 Claude Code에만 해당하는 내용만 둔다.

- 서브 에이전트는 Agent 도구로 띄운다. 독립 태스크는 한 응답에서 여러 Agent 호출로 병렬 실행한다.
- 리뷰는 `AGENTS.md`의 "리뷰 · QA (회사 방침)" 순서(①~⑤)를 따른다.
- agent-skills는 `.claude/skills/`에, 다른 도구용 사본은 `.agents/skills/`에 있다.
