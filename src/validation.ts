/**
 * @tested src/validation.test.ts
 * @handbook 6.1-id-slug-guards
 * @handbook 6.2-path-traversal
 */
import path from 'path';
import { z } from 'zod';

const SYNC_DIR = path.resolve(process.env.HOME || '~', 'blog-drafts');

/** Ghost resource ID: 24-character hex string */
export const ghostId = z
  .string()
  .regex(/^[a-f0-9]{24}$/, 'Must be a 24-character hex Ghost ID');

/** Ghost slug: safe URL path segment (no traversal characters) */
export const safeSlug = z
  .string()
  .refine(
    (s) => !/[\/\\?#\x00]/.test(s) && !s.includes('..'),
    'Slug contains unsafe characters'
  );

/**
 * Validate that a file path resolves within ~/blog-drafts/.
 * Prevents path traversal outside the sync directory.
 */
export function validateSyncPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const syncDir = SYNC_DIR + path.sep;
  if (!resolved.startsWith(syncDir) && resolved !== SYNC_DIR) {
    throw new Error(`Path must be within ${SYNC_DIR}`);
  }
  return resolved;
}

/** Audit log to stderr (stdout is reserved for MCP stdio protocol) */
export function audit(
  action: string,
  details: Record<string, unknown>
): void {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      action,
      ...details,
    })
  );
}

/**
 * Pure-function checks used by both the boundary loader (config.ts) and the
 * setup wizard prompts (setup.ts). Return undefined on valid input, an error
 * message on invalid. Single source of truth — keeps the rules and messages
 * from drifting between server-startup validation and the interactive UI.
 */
export function checkGhostUrl(v: string | undefined): string | undefined {
  if (!v) return 'URL is required';
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return 'Invalid URL';
  }
  if (
    parsed.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(parsed.hostname)
  ) {
    return 'Must use HTTPS (except localhost)';
  }
  return undefined;
}

export function checkGhostKey(v: string | undefined): string | undefined {
  if (!v) return 'API key is required';
  const parts = v.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return 'Must be in "id:secret" format';
  }
  if (!/^[a-f0-9]+$/.test(parts[1])) {
    return 'Secret must be hex-encoded';
  }
  return undefined;
}
