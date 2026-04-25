#!/usr/bin/env node
/**
 * Dev-only preview of MCP tool outputs against a real Ghost instance.
 * Spins up the project's tools in-memory and prints each tool's output —
 * useful for visually inspecting tool surface changes without restarting
 * the production MCP server.
 *
 * Requires the project to be built first (imports from dist/):
 *   npm run build
 *
 * Usage:
 *   GHOST_URL=https://blog.example.com \
 *   GHOST_ADMIN_API_KEY=id:secret \
 *   node scripts/preview-tools.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GhostAdminApi } from '../dist/ghost/client.js';
import { registerPostTools } from '../dist/tools/post-tools.js';
import { registerPageTools } from '../dist/tools/page-tools.js';

const url = process.env.GHOST_URL;
const key = process.env.GHOST_ADMIN_API_KEY;
if (!url || !key) {
  console.error('Missing GHOST_URL / GHOST_ADMIN_API_KEY');
  process.exit(1);
}

const ghost = new GhostAdminApi(url, key);
const server = new McpServer({ name: 'preview', version: '0.0.1' });
registerPostTools(server, ghost);
registerPageTools(server, ghost);

const client = new Client({ name: 'preview-client', version: '0.0.1' });
const [c, s] = InMemoryTransport.createLinkedPair();
await Promise.all([client.connect(c), server.server.connect(s)]);

async function call(name, args, label) {
  console.log(`\n========== ${label} ==========`);
  console.log(`tool: ${name}  args: ${JSON.stringify(args)}\n`);
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '(no text)';
  console.log(text);
}

// 1. list_posts base table — no status filter, show_email opt-out → 기본 6컬럼
await call('ghost_list_posts', { limit: 3, show_email: false }, 'list_posts (base — no email columns)');

// 2. list_posts with show_email auto-on (scheduled)
//    → status가 scheduled이므로 Newsletter/Segment/Email 컬럼이 자동 활성
await call('ghost_list_posts', { status: 'scheduled', limit: 3 }, 'list_posts (status=scheduled, auto email columns)');

// 3. list_posts explicit show_email on no-status
await call('ghost_list_posts', { limit: 3, show_email: true }, 'list_posts (no status, show_email=true)');

// 4. get_post — 두 케이스: scheduled (newsletter 미설정) + published with email (sent newsletter)
const { posts: sched } = await ghost.getPosts({ status: 'scheduled', limit: 1 });
if (sched[0]) {
  await call('ghost_get_post', { slug: sched[0].slug }, `get_post (scheduled — no newsletter)`);
}

// 발송된 적 있는 published 포스트 찾기 — newsletter 객체 노출 확인.
// includeEmail: true 필수 — 그렇지 않으면 lazy-include로 두 필드가 응답에서
// 빠져 find()가 항상 undefined를 반환.
const { posts: pubs } = await ghost.getPosts({
  status: 'published',
  limit: 20,
  includeEmail: true,
});
const sent = pubs.find((p) => p.email || p.newsletter);
if (sent) {
  await call('ghost_get_post', { slug: sent.slug }, `get_post (published — newsletter sent)`);
} else {
  console.log('\n(no published post with newsletter found in first 20)');
}

// 5. list_pages — Vis column 추가 확인
await call('ghost_list_pages', { limit: 3 }, 'list_pages (Vis column added)');

// 6. get_page — 새 행들
const { pages } = await ghost.getPages({ limit: 5 });
// feature_image 또는 meta_* 채워진 페이지 우선
const richPage = pages.find((p) => p.feature_image || p.meta_title || p.meta_description || p.custom_excerpt) || pages[0];
if (richPage) {
  await call('ghost_get_page', { slug: richPage.slug }, `get_page (slug=${richPage.slug})`);
}

await client.close();
