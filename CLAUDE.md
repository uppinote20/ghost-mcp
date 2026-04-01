# Ghost MCP Server

Ghost 블로그 관리 MCP 서버. Claude Code / Cursor 등에서 Ghost Admin API를 직접 호출.

## 빌드 & 테스트

```bash
npm install
npm run build
npm test
```

## 구조

- `src/config.ts` - 환경변수 로딩 + HTTPS/API 키 검증
- `src/validation.ts` - 입력값 검증 (ghostId, safeSlug, path traversal 방지)
- `src/ghost/client.ts` - Ghost Admin API 클라이언트 (JWT 인증, 에러 정규화)
- `src/ghost/types.ts` - Ghost API 타입 정의
- `src/tools/` - MCP 도구 (post, page, tag, sync)
- `src/parsers/markdown-parser.ts` - 블로그 마크다운 → Ghost mobiledoc/lexical 변환
- `src/sync/index-manager.ts` - 로컬 ~/blog-drafts ↔ Ghost 동기화 인덱스

## 환경변수

`GHOST_URL`, `GHOST_ADMIN_API_KEY` — MCP 클라이언트 설정의 `env` 필드로 전달.
`npm run setup`으로 자동 등록 가능.

## 패키지 매니저

npm (package-lock.json)
