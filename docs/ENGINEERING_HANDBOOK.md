# Ghost MCP Engineering Handbook

> 코드베이스의 실제 패턴과 아키텍처를 문서화한 엔지니어링 핸드북.
> 환경 설정, 빌드/테스트 방법, 패키지 매니저 정책 등 운영 규칙은 [`CLAUDE.md`](../CLAUDE.md) 참조.

## 양방향 링크 시스템

| 방향 | 마커 형식 | 예시 |
|------|----------|------|
| 코드 → 문서 | `@handbook X.Y-slug` | `@handbook 3.1-jwt-token` |
| 문서 → 코드 | `<!-- @code path -->` | `<!-- @code src/ghost/client.ts -->` |

마커 검색: `grep -r "@handbook" src/`. 변경 시 양쪽 동기화 필요 — 핸드북 섹션이 옮겨지면 코드 마커도 함께 갱신.

---

## 1. 프로젝트 개요

### 1.1 목적

Claude Code / Cursor 등 MCP 호환 에이전트에서 Ghost Admin API를 호출하는 stdio MCP 서버. 포스트 CRUD, 페이지 관리, 태그 분석, 로컬 마크다운 ↔ Ghost 동기화를 도구로 노출.

### 1.2 모듈 의존 방향

```
index.ts → server.ts → tools/*-tools.ts → ghost/client.ts → fetch
                    └→ sync/index-manager.ts (push_local만)
                    └→ parsers/markdown-parser.ts (push_local만)

config.ts        ← server.ts (env 로드)
validation.ts    ← tools/*, sync (Zod helpers)
ghost/types.ts   ← client.ts, tools/* (타입 정의)
```

도구 계층은 클라이언트 계층을 통해서만 외부 통신. 검증 헬퍼는 도구 진입에서만 실행. 어떤 모듈도 `process.env`를 직접 읽지 않음 — 모두 `Config`로 주입.

---

## 2. MCP 부트스트랩

### 2.1 진입점

<!-- @code src/index.ts -->

`src/index.ts`는 thin entrypoint — `loadConfig` → `createServer` → `StdioServerTransport.connect`. 비즈니스 로직 없음. 이 패턴은 의도적 — 부트스트랩과 도메인을 분리해 단위 테스트가 server 객체만 import하면 되도록.

### 2.2 Server Instructions

<!-- @code src/server.ts -->

`createServer(config)`는 `McpServer`를 인스턴스화하면서 `instructions` 필드에 도구 선택 가이드(`SERVER_INSTRUCTIONS`)를 넣음. 이 텍스트는 LLM이 어떤 도구를 언제 쓸지 판단하는 1차 컨텍스트가 됨 — 새 도구를 추가하면 가이드라인을 함께 갱신.

도구 등록 순서: `Post → Tag → Page → Sync`. `IndexManager`는 sync 도구만 사용하므로 한 번 instantiate해 sync 등록에만 주입.

### 2.3 Config 검증

<!-- @code src/config.ts -->

`loadConfig`는 환경변수를 단순 read하지 않고 **boundary validation**을 수행:
- `GHOST_URL`은 HTTPS만 허용 (단 localhost / 127.0.0.1 예외 — dev 편의)
- `GHOST_ADMIN_API_KEY`는 `id:secret` 형식이며 secret은 hex여야 함 (Ghost JWT 사양)

검증 실패 시 즉시 `Error` throw — fail-fast로 잘못된 설정이 런타임에 깊숙이 들어가지 않음.

---

## 3. Ghost Admin API 클라이언트

`src/ghost/client.ts`의 `GhostAdminApi` 클래스는 모든 외부 통신의 단일 진입점.

### 3.1 JWT 토큰

<!-- @code src/ghost/client.ts -->

Admin API 인증은 매 요청마다 **5분 만료** JWT를 새로 생성. `kid` 헤더에 key id, payload는 `{iat, exp:iat+300, aud:'/admin/'}`. secret은 hex 디코딩 후 HMAC-SHA256.

요청 시점에 토큰을 매번 만든다는 점이 중요 — 토큰을 캐시하지 않음. 5분이 짧아 보이지만 stdio 단명 프로세스 + 매 요청 생성이라 비용 무시 가능.

### 3.2 에러 정규화

API 4xx/5xx 응답은 raw JSON을 그대로 노출하지 않고 `errors[0].type`만 추출:

```typescript
throw new Error(`Ghost API error ${response.status}: ${code}`);
```

이유 — Ghost가 errors의 `context`/`message`에 내부 SQL 구문이나 secret URL을 흘릴 수 있어 LLM 출력으로 직접 노출하면 위험. type 토큰은 안전하고 LLM이 행동 결정에 충분.

### 3.3 Lazy-include 정책

Ghost Admin API는 `?include=` 토큰으로 명시한 관계만 응답에 직렬화 (GraphQL selection set과 유사한 철학). 도구 별로 비용 의식적 opt-in:

| 호출 | 기본 include | 비용 |
|---|---|---|
| `getPost(id)` | `tags` | 가벼움 |
| `getPost(id, { includeEmail: true })` | `tags,email,newsletter` | 추가 join |
| `getPosts({})` | `tags` | 리스트 가벼움 |
| `getPosts({ includeEmail: true })` | `tags,email,newsletter` | 리스트 무거움 |

`ghost_get_post`/`ghost_list_posts`(with `show_email`)만 opt-in. `ghost_update_post`의 optimistic-lock pre-fetch나 sync push의 update path는 default false로 latency 절감.

검증된 토큰: `tags`, `authors`, `email`, `newsletter`, `tiers`, `count.*` 등 (TryGhost/Ghost source의 `allowedIncludes` 확인). 알 수 없는 토큰은 silent ignore라 단위 테스트가 typo 보호.

---

## 4. 타입 설계

### 4.1 Post / Page 분리

<!-- @code src/ghost/types.ts -->

`GhostPost`와 `GhostPage`는 데이터 모델이 거의 같지만 **별도 인터페이스**로 정의:
- `GhostPost.status` ∋ `'sent'` (이메일 발송 후 상태) — Page엔 없음
- `GhostPost`만 `email`, `newsletter`, `email_segment` 보유

이전엔 `type GhostPage = GhostPost` alias였으나 — Page에 newsletter가 silently 새어들 수 있는 forward-looking risk라 별도 interface로 분리. `GhostPostUpdate` / `GhostPageUpdate`도 동일 원칙.

### 4.2 Lazy-include 필드 = optional

`email`, `newsletter`, `email_segment`는 `?` optional. include 안 하면 응답에 키 자체가 없고, include 했는데 발송 안 된 포스트는 `null`. 두 상태(undefined / null)를 모두 처리해야:

```typescript
post.email?.recipient_filter ?? 'N/A'  // null도, undefined도, '(none)' 행으로
post.newsletter?.slug || '(none)'
```

`email_segment`는 lazy-include 정책의 예외 — Ghost가 항상 응답에 포함 (default `'all'`). 따라서 `email_segment ?? 'all'`로 fallback.

---

## 5. MCP 도구 등록 패턴

`src/tools/*-tools.ts`의 모든 `register*Tools(server, ghost)` 함수는 동일한 5요소 구조: tool name → description → Zod schema → async handler → audit.

### 5.1 Zod Schema + 표 출력 포매터

<!-- @code src/tools/post-tools.ts -->
<!-- @code src/tools/page-tools.ts -->
<!-- @code src/tools/tag-tools.ts -->
<!-- @code src/tools/sync-tools.ts -->

각 도구는 Zod schema로 입력 검증 (모든 ID는 `ghostId`, slug는 `safeSlug` 헬퍼 재사용). 출력은 markdown table 또는 key-value 표 형태 — LLM이 그대로 읽거나 사용자에게 렌더링.

표 컬럼은 `padEnd(N).slice(0, N)`로 고정 폭 유지. `show_email` 같은 옵션이 컬럼 수를 바꿀 때는 header/separator/row 세 곳을 함께 분기 — 폭이 어긋나면 markdown 렌더가 깨짐.

### 5.2 Optimistic Locking + 2-step Visibility Update

`ghost_update_post`/`ghost_update_page`는 update 전 항상 `getPost`/`getPage`로 `updated_at`을 가져옴 (concurrency token). Ghost는 `updated_at`이 서버 값과 다르면 409. 이 패턴은 의도적으로 클라이언트가 stale 변경을 덮어쓰지 못하게 함.

또 한 가지 패턴: visibility 변경은 **항상 별도 PUT으로 분리**:

```ts
if (Object.keys(otherFields).length > 0 || newsletterOpts) {
  current = await ghost.updateXxx({...otherFields}, opts);  // 1차 PUT
}
if (visibility !== undefined) {
  page = await ghost.updateXxx({ visibility });  // 2차 PUT, 새 updated_at 사용
}
```

이유 — Ghost API는 visibility를 다른 필드와 함께 보내면 silently drop하는 경우가 있음. 분리해 보내야 안정.

### 5.3 Empty-input Guard + Audit Logging

도구 핸들러 진입 직후 모든 optional 필드가 undefined면 무용 GET 호출 + 빈 audit를 피하기 위해 즉시 isError 반환:

```ts
const hasAnyField = [title, slug, ...].some(v => v !== undefined);
if (!hasAnyField) return { content: [...], isError: true };
```

audit는 stderr로만 출력 (stdout은 MCP stdio protocol 점유). 두 PUT 호출이 끝난 뒤 한 번만 호출하고 `fields` 배열에 적용된 키 모음:

```ts
audit('update_post', { id, fields });  // ['title', 'visibility', 'newsletter']
```

---

## 6. 검증 & 보안

<!-- @code src/validation.ts -->

### 6.1 ID / Slug 가드

- `ghostId`: 24-character hex 정규식. Ghost ObjectId 형식과 정확히 매칭. 잘못된 입력으로 path traversal (`../admin/settings`) 시도 차단.
- `safeSlug`: `\, /, ?, #, NUL` 거부 + `..` 거부.

이 두 helper는 모든 도구 schema에서 재사용. tool-by-tool 검증을 흩뿌리지 않고 한 곳에 모아야 정책이 drift하지 않음.

### 6.2 Path Traversal 방어

`validateSyncPath`는 `~/blog-drafts/` 밖의 파일 접근을 차단 (`ghost_push_local`이 사용). `path.resolve` 후 prefix 비교 — 단순 string match가 아니라 정규화된 absolute path 비교.

### 6.3 JWT 보안

- 5분 만료 — 토큰 유출돼도 윈도우 짧음
- 토큰 캐시 안 함 — 요청 직전 매번 생성 (memory exposure 시간 최소)
- secret은 hex 디코딩 후 즉시 HMAC 생성, 별도 변수 보관 안 함

---

## 7. 동기화 (블로그 마크다운 ↔ Ghost)

### 7.1 Markdown 포맷 자동 감지

<!-- @code src/parsers/markdown-parser.ts -->

`parseBlogMarkdown`은 3개 포맷을 자동 인식:
1. **Standard frontmatter** (`---` YAML + `# Title` + body) — 권장
2. **Plain markdown** (`# Title` + body)
3. **Legacy markers** (`<!-- 본문 시작 --> ... <!-- MCP 파싱 마커 -->`) — 내부 `/blog` 명령용

순서가 중요 — legacy 마커가 우선 (혼재 시 명확). 의존성 추가 없이 자체 YAML key-value 파서. 하이픈 키(`meta-title`)는 underscore(`meta_title`)로 정규화.

### 7.2 Sync Index

<!-- @code src/sync/index-manager.ts -->

`~/blog-drafts/.ghost-sync.json`이 single source of truth — 파일별 `{ghostId, ghostSlug, ghostStatus, ghostUpdatedAt, localHash, lastPushed}` 보관. drift 감지는 hash 비교.

scan 단계에서 symlink 차단 (`isSymbolicLink()`로 디렉토리 traversal 방어). dotfile은 무시.

### 7.3 Lexical vs Mobiledoc 자동 감지

<!-- @code src/tools/sync-tools.ts -->

`ghost_push_local`이 update path를 탈 때 기존 포스트의 `current.lexical` 존재 여부로 에디터 형식을 감지 → 같은 형식으로 변환해 보냄. 새 포스트 create는 항상 lexical (Ghost 5.x 기본).

mobiledoc은 legacy — 새로 만들지 않지만 기존 포스트 호환성 유지.

---

## 8. 테스트 패턴

### 8.1 InMemoryTransport로 도구 통합 테스트

<!-- @code src/tools/tools.test.ts -->

도구 핸들러를 실제 MCP client/server pair에 연결해 호출. server 객체에 mock `GhostAdminApi`를 주입하고 `InMemoryTransport.createLinkedPair()`로 transport 우회:

```ts
const server = new McpServer({...});
registerPostTools(server, mockGhost);
const [c, s] = InMemoryTransport.createLinkedPair();
await Promise.all([client.connect(c), server.server.connect(s)]);
const result = await client.callTool({ name: 'ghost_get_post', arguments: {...} });
```

이렇게 하면 zod 검증, 출력 포매터, audit까지 모두 실행 — 진정한 black box 테스트. unit-test 격으로 빠르고 (in-process), 실제 사용 시점과 동일한 경로.

### 8.2 fetch mock으로 클라이언트 단위 테스트

<!-- @code src/ghost/client.test.ts -->

`vi.stubGlobal('fetch', vi.fn().mockResolvedValue({...}))`로 Ghost API 응답을 모방. URL string에 직접 어서션 — `?include=tags,email,newsletter` 같은 파라미터가 정확히 직렬화되는지.

`getPost`/`getPostBySlug`는 raw template literal이라 `,` 그대로, `getPosts`는 `URLSearchParams`라 `%2C`로 인코딩 — 두 인코딩 모두 Ghost가 받아주지만 테스트는 각각 명시.

### 8.3 양방향 마커 시스템

세 종류의 마커가 한 코드베이스에서 공존:
- `@tested src/foo.test.ts` — 소스 → 테스트 (forward)
- `@covers src/foo.ts` — 테스트 → 소스 (reverse)
- `@handbook 3.1-jwt-token` — 소스 → 핸드북 (이 문서)
- `<!-- @code path -->` — 핸드북 → 소스

같은 JSDoc 블록 안에 공존:

```typescript
/**
 * @handbook 3.1-jwt-token
 * @tested src/ghost/client.test.ts
 */
```

`grep -r "@handbook" src/`, `grep -r "@tested" src/`로 한 명령에 무결성 검증. `/update-test-map`, `/update-handbook` 스킬이 자동 동기화 + 끊어진 링크 보고.
