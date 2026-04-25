#!/usr/bin/env node
/**
 * Dev-only verifier for Ghost Admin API email engagement payload shape.
 * Probes a sent post via two paths:
 *   1. GET /admin/posts/:id/?include=email — embedded email object
 *   2. GET /admin/emails/:email_id/        — full email object via separate endpoint
 * and prints the union of all field names + sample values so we can decide
 * what's safe to surface in MCP read paths.
 *
 * Self-contained (no project deps).
 *
 * Usage:
 *   GHOST_URL=https://blog.example.com \
 *   GHOST_ADMIN_API_KEY=id:secret \
 *   node scripts/verify-email-metrics.mjs
 */
import crypto from 'crypto';

const url = process.env.GHOST_URL;
const key = process.env.GHOST_ADMIN_API_KEY;
if (!url || !key) {
  console.error('Missing GHOST_URL or GHOST_ADMIN_API_KEY');
  process.exit(1);
}

function jwt() {
  const [id, secret] = key.split(':');
  const iat = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = enc({ alg: 'HS256', typ: 'JWT', kid: id });
  const p = enc({ iat, exp: iat + 300, aud: '/admin/' });
  const sig = crypto
    .createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${h}.${p}`)
    .digest('base64url');
  return `${h}.${p}.${sig}`;
}

async function get(path) {
  const res = await fetch(`${url.replace(/\/$/, '')}/ghost/api/admin/${path}`, {
    headers: { Authorization: `Ghost ${jwt()}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json();
}

async function main() {
  console.log(`URL: ${url}\n`);

  // Find a post that has been sent or has email object populated.
  console.log('## Searching for a sent/published post with email payload...\n');
  const filter = encodeURIComponent('status:[published,sent]');
  const list = await get(
    `posts/?filter=${filter}&limit=20&include=email,newsletter&order=published_at%20desc`
  );
  const candidate = list.posts?.find((p) => p.email && p.email.id);
  if (!candidate) {
    console.log('No post with embedded email object found. Aborting.');
    return;
  }

  console.log(`Found: ${candidate.slug} (status=${candidate.status})\n`);

  // 1. Embedded email object via post endpoint.
  console.log('## 1. Embedded email object (via GET /posts/:id/?include=email,newsletter)\n');
  const detail = await get(
    `posts/${candidate.id}/?include=email,newsletter`
  );
  const post = detail.posts?.[0];
  console.log('Embedded email keys:', Object.keys(post.email || {}).sort());
  console.log('Embedded email sample:');
  console.log(JSON.stringify(post.email, null, 2));
  console.log('\nNewsletter object:');
  console.log(JSON.stringify(post.newsletter, null, 2));

  // 2. Full email object via separate endpoint. Cache for section 3 reuse.
  let fullEmail = null;
  if (post.email?.id) {
    console.log('\n## 2. Full email object (via GET /emails/:email_id/)\n');
    try {
      const emailRes = await get(`emails/${post.email.id}/`);
      fullEmail = emailRes.emails?.[0] ?? null;
      console.log('Full email keys:', Object.keys(fullEmail || {}).sort());
      console.log('Full email sample:');
      console.log(
        JSON.stringify(
          fullEmail,
          (k, v) =>
            // hide bulky html/plaintext to keep output readable
            k === 'html' || k === 'plaintext'
              ? `[${typeof v === 'string' ? v.length : 0} chars]`
              : v,
          2
        )
      );
    } catch (e) {
      console.log(`Failed to fetch full email: ${e.message}`);
    }
  }

  // 3. Diff of keys between embedded and full (reuse fullEmail from section 2)
  console.log('\n## 3. Field availability summary\n');
  if (!fullEmail) {
    console.log('(skipped — full email payload unavailable, see section 2)');
    return;
  }
  const embeddedKeys = new Set(Object.keys(post.email || {}));
  const fullKeys = new Set(Object.keys(fullEmail));
  const onlyEmbedded = [...embeddedKeys].filter((k) => !fullKeys.has(k));
  const onlyFull = [...fullKeys].filter((k) => !embeddedKeys.has(k));
  const common = [...embeddedKeys].filter((k) => fullKeys.has(k));
  console.log(
    `Common (${common.length}):`,
    common.sort().join(', ') || '(none)'
  );
  console.log(
    `Only in embedded (${onlyEmbedded.length}):`,
    onlyEmbedded.sort().join(', ') || '(none)'
  );
  console.log(
    `Only in full (${onlyFull.length}):`,
    onlyFull.sort().join(', ') || '(none)'
  );
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
