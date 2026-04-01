/** @covers src/validation.ts */
import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';
import { ghostId, safeSlug, validateSyncPath, audit } from './validation.js';

// ── ghostId ──────────────────────────────────────────────

describe('ghostId', () => {
  it('accepts valid 24-char hex ID', () => {
    const result = ghostId.safeParse('507f1f77bcf86cd799439011');
    expect(result.success).toBe(true);
  });

  it('rejects too-short hex string', () => {
    const result = ghostId.safeParse('507f1f77bcf86cd7');
    expect(result.success).toBe(false);
  });

  it('rejects too-long hex string', () => {
    const result = ghostId.safeParse('507f1f77bcf86cd799439011aa');
    expect(result.success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    const result = ghostId.safeParse('507f1f77bcf86cd79943901g');
    expect(result.success).toBe(false);
  });

  it('rejects path traversal in ID', () => {
    const result = ghostId.safeParse('../../etc/passwd/aaaaaa');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = ghostId.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects uppercase hex', () => {
    const result = ghostId.safeParse('507F1F77BCF86CD799439011');
    expect(result.success).toBe(false);
  });
});

// ── safeSlug ─────────────────────────────────────────────

describe('safeSlug', () => {
  it('accepts simple slug', () => {
    const result = safeSlug.safeParse('my-blog-post');
    expect(result.success).toBe(true);
  });

  it('accepts slug with numbers', () => {
    const result = safeSlug.safeParse('post-2024-01');
    expect(result.success).toBe(true);
  });

  it('accepts single character', () => {
    const result = safeSlug.safeParse('a');
    expect(result.success).toBe(true);
  });

  it('rejects slug with forward slash (path traversal)', () => {
    const result = safeSlug.safeParse('../admin/settings');
    expect(result.success).toBe(false);
  });

  it('rejects slug with backslash', () => {
    const result = safeSlug.safeParse('foo\\bar');
    expect(result.success).toBe(false);
  });

  it('rejects slug with dot-dot traversal', () => {
    const result = safeSlug.safeParse('..my-slug');
    expect(result.success).toBe(false);
  });

  it('rejects slug with query string', () => {
    const result = safeSlug.safeParse('slug?admin=true');
    expect(result.success).toBe(false);
  });

  it('rejects slug with hash', () => {
    const result = safeSlug.safeParse('slug#fragment');
    expect(result.success).toBe(false);
  });

  it('rejects slug with null byte', () => {
    const result = safeSlug.safeParse('slug\x00evil');
    expect(result.success).toBe(false);
  });
});

// ── validateSyncPath ─────────────────────────────────────

describe('validateSyncPath', () => {
  const syncDir = path.resolve(process.env.HOME || '~', 'blog-drafts');

  it('accepts file inside ~/blog-drafts/', () => {
    const filePath = path.join(syncDir, 'my-post.md');
    expect(validateSyncPath(filePath)).toBe(filePath);
  });

  it('accepts file in subdirectory of ~/blog-drafts/', () => {
    const filePath = path.join(syncDir, 'drafts', 'post.md');
    expect(validateSyncPath(filePath)).toBe(filePath);
  });

  it('rejects path outside ~/blog-drafts/', () => {
    expect(() => validateSyncPath('/etc/passwd')).toThrow(
      'Path must be within'
    );
  });

  it('rejects path traversal escaping ~/blog-drafts/', () => {
    const malicious = path.join(syncDir, '..', '.ssh', 'id_rsa');
    expect(() => validateSyncPath(malicious)).toThrow('Path must be within');
  });

  it('rejects home directory itself', () => {
    expect(() =>
      validateSyncPath(process.env.HOME || '~')
    ).toThrow('Path must be within');
  });

  it('rejects relative path that resolves outside sync dir', () => {
    expect(() => validateSyncPath('../../etc/passwd')).toThrow(
      'Path must be within'
    );
  });

  it('normalizes path before checking', () => {
    // ~/blog-drafts/./subdir/../file.md resolves to ~/blog-drafts/file.md
    const tricky = path.join(syncDir, '.', 'subdir', '..', 'file.md');
    expect(validateSyncPath(tricky)).toBe(path.join(syncDir, 'file.md'));
  });
});

// ── audit ────────────────────────────────────────────────

describe('audit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes JSON to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    audit('test_action', { key: 'value' });

    expect(spy).toHaveBeenCalledOnce();
    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(output.action).toBe('test_action');
    expect(output.key).toBe('value');
    expect(output.ts).toBeDefined();
  });

  it('includes ISO timestamp', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    audit('ts_check', {});

    const output = JSON.parse(spy.mock.calls[0][0] as string);
    expect(() => new Date(output.ts)).not.toThrow();
    expect(new Date(output.ts).toISOString()).toBe(output.ts);
  });
});
