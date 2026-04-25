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

## Engineering Handbook

상세한 코딩 패턴, 아키텍처, Ghost API quirk(lazy-include, optimistic locking, JWT 등)는
[`docs/ENGINEERING_HANDBOOK.md`](docs/ENGINEERING_HANDBOOK.md) 참조.

**양방향 링크 시스템:**
- 코드의 `@handbook 3.1` → 핸드북 섹션 참조
- 핸드북의 `<!-- @code -->` 마커 → 소스 파일 참조
- 변경 시 양쪽 동기화 필요 (`/update-handbook` 스킬)
- 마커 검색: `grep -r "@handbook" src/`

### Quick Reference

| 찾는 것 | HANDBOOK 섹션 |
|---------|---------------|
| 모듈 의존 방향 | 1.2 |
| MCP 부트스트랩 / Server Instructions | 2 |
| JWT 토큰 / 에러 정규화 / Lazy-include | 3 |
| Post/Page 타입 분리 | 4 |
| Zod schema + 표 출력 / Optimistic locking / Empty-input guard | 5 |
| 검증 (ghostId, safeSlug, path traversal) / JWT 보안 | 6 |
| 마크다운 포맷 자동 감지 / Sync index / Lexical vs Mobiledoc | 7 |
| InMemoryTransport / fetch mock / 양방향 마커 | 8 |

### Boilerplate Reference

| 패턴 | 참고 파일 |
|------|----------|
| 새 MCP 도구 추가 | `src/tools/tag-tools.ts` (가장 단순한 예) |
| Optimistic locking + visibility split | `src/tools/post-tools.ts` ghost_update_post |
| Ghost API 호출 추가 | `src/ghost/client.ts` getPost / getPosts |
| 입력 검증 helper 재사용 | `src/validation.ts` ghostId / safeSlug |
| MCP integration 테스트 | `src/tools/tools.test.ts` setupMcpClient |
| Ghost client 단위 테스트 | `src/ghost/client.test.ts` fetch stub |
