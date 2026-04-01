/** @tested src/validation.test.ts */
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
