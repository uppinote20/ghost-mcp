#!/usr/bin/env node
/**
 * Dev-only verifier for Ghost Admin API include=email,newsletter behavior.
 * Reads GHOST_URL + GHOST_ADMIN_API_KEY from env, prints raw response shape
 * for the email/newsletter/email_segment fields across post statuses.
 *
 * Self-contained (no project deps). Useful when validating Ghost API
 * compatibility on a new instance or after a Ghost version bump.
 *
 * Usage:
 *   GHOST_URL=https://blog.example.com \
 *   GHOST_ADMIN_API_KEY=id:secret \
 *   node scripts/verify-includes.mjs
 */
import crypto from 'crypto';

const url = process.env.GHOST_URL;
const key = process.env.GHOST_ADMIN_API_KEY;
if (!url || !key) {
  console.error('Missing GHOST_URL or GHOST_ADMIN_API_KEY env var');
  process.exit(1);
}

function jwt() {
  const [id, secret] = key.split(':');
  const iat = Math.floor(Date.now() / 1000);
  const enc = (o) =>
    Buffer.from(JSON.stringify(o)).toString('base64url');
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

function shape(post) {
  const keys = Object.keys(post).sort();
  const out = {
    id: post.id,
    slug: post.slug,
    status: post.status,
    has_email_key: 'email' in post,
    has_newsletter_key: 'newsletter' in post,
    has_email_segment_key: 'email_segment' in post,
    email_value: post.email,
    newsletter_value: post.newsletter,
    email_segment_value: post.email_segment,
    all_keys: keys,
  };
  return out;
}

async function probeStatus(status, includeStr) {
  const filter = encodeURIComponent(`status:${status}`);
  const include = encodeURIComponent(includeStr);
  try {
    const data = await get(`posts/?filter=${filter}&limit=1&include=${include}`);
    const post = data.posts?.[0];
    if (!post) return { status, include: includeStr, empty: true };
    return { status, include: includeStr, sample: shape(post) };
  } catch (e) {
    return { status, include: includeStr, error: e.message };
  }
}

async function main() {
  console.log('=== Probing Ghost Admin API ===');
  console.log('URL:', url);
  console.log();

  for (const includeStr of ['tags', 'tags,email,newsletter']) {
    console.log(`\n## include=${includeStr}\n`);
    for (const status of ['scheduled', 'published', 'sent', 'draft']) {
      const result = await probeStatus(status, includeStr);
      console.log(JSON.stringify(result, null, 2));
    }
  }

  // Also check rejection: an invalid include token
  console.log('\n## include=tags,bogus_token (sanity — does Ghost reject unknowns?)\n');
  try {
    const data = await get('posts/?limit=1&include=tags%2Cbogus_token');
    console.log('Unknown token accepted, post returned:', !!data.posts?.[0]);
  } catch (e) {
    console.log('Rejected:', e.message);
  }
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
