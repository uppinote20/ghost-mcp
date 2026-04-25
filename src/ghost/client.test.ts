/** @covers src/ghost/client.ts */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { GhostAdminApi } from './client.js';

const VALID_KEY = 'aaaaaaaaaaaaaaaaaaaaaa11:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const GHOST_URL = 'https://blog.example.com';

describe('GhostAdminApi', () => {
  let api: GhostAdminApi;

  beforeEach(() => {
    api = new GhostAdminApi(GHOST_URL, VALID_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Lazy-include fields ──

  describe('include=email,newsletter on read paths', () => {
    function stubFetchOk() {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ posts: [{}] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('getPost requests include=tags,email,newsletter', async () => {
      const fetchMock = stubFetchOk();
      await api.getPost('507f1f77bcf86cd799439011');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('include=tags,email,newsletter');
    });

    it('getPostBySlug requests include=tags,email,newsletter', async () => {
      const fetchMock = stubFetchOk();
      await api.getPostBySlug('hello-world');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('include=tags,email,newsletter');
    });

    it('getPosts requests include=tags,email,newsletter (URLSearchParams-encoded)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ posts: [], meta: {} }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await api.getPosts();
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('include=tags%2Cemail%2Cnewsletter');
    });
  });

  // ── Error normalization ──

  describe('request error normalization', () => {
    it('returns only error type, not full JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          json: () =>
            Promise.resolve({
              errors: [
                {
                  type: 'NotFoundError',
                  message: 'Resource not found (internal detail)',
                  context: 'Some sensitive context',
                },
              ],
            }),
        })
      );

      await expect(api.getPost('507f1f77bcf86cd799439011')).rejects.toThrow(
        'Ghost API error 404: NotFoundError'
      );
      // Should NOT contain the sensitive context or message
      await expect(
        api.getPost('507f1f77bcf86cd799439011')
      ).rejects.not.toThrow('sensitive');
    });

    it('returns UnknownError when response is not JSON', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('not json')),
        })
      );

      await expect(api.getPost('507f1f77bcf86cd799439011')).rejects.toThrow(
        'Ghost API error 500: UnknownError'
      );
    });

    it('returns UnknownError when error format is unexpected', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 422,
          json: () => Promise.resolve({ message: 'something went wrong' }),
        })
      );

      await expect(api.getPost('507f1f77bcf86cd799439011')).rejects.toThrow(
        'Ghost API error 422: UnknownError'
      );
    });
  });

  // ── Upload restrictions (uses real temp files to avoid ESM mock issues) ──

  describe('uploadImage', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-upload-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('rejects files larger than 20 MB', async () => {
      const bigFile = path.join(tmpDir, 'huge.png');
      // Write a 21 MB file
      const fd = fsSync.openSync(bigFile, 'w');
      fsSync.ftruncateSync(fd, 21 * 1024 * 1024);
      fsSync.closeSync(fd);

      await expect(api.uploadImage(bigFile)).rejects.toThrow(
        'exceeds maximum upload size'
      );
    });

    it('falls back to image/png for unknown extensions', async () => {
      const bmpFile = path.join(tmpDir, 'photo.bmp');
      await fs.writeFile(bmpFile, Buffer.alloc(100));

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            images: [{ url: 'https://cdn.example.com/img.bin' }],
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await api.uploadImage(bmpFile);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('does not send SVG with image/svg+xml content type', async () => {
      const svgFile = path.join(tmpDir, 'malicious.svg');
      await fs.writeFile(
        svgFile,
        '<svg><script>alert(1)</script></svg>'
      );

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            images: [{ url: 'https://cdn.example.com/xss.svg' }],
          }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await api.uploadImage(svgFile);

      const call = fetchMock.mock.calls[0];
      const headers = call[1].headers as Record<string, string>;
      // SVG falls back to image/png — not explicitly supported
      expect(headers['Content-Type']).not.toContain('svg');
    });
  });

  // ── JWT generation ──

  describe('generateToken', () => {
    it('generates a valid 3-part JWT', () => {
      // Access private method via any cast for testing
      const token = (api as any).generateToken();
      const parts = token.split('.');
      expect(parts).toHaveLength(3);

      // Decode header
      const header = JSON.parse(
        Buffer.from(parts[0], 'base64url').toString()
      );
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
      expect(header.kid).toBe('aaaaaaaaaaaaaaaaaaaaaa11');
    });

    it('sets 5-minute expiration', () => {
      const token = (api as any).generateToken();
      const parts = token.split('.');
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString()
      );
      expect(payload.exp - payload.iat).toBe(300);
      expect(payload.aud).toBe('/admin/');
    });
  });
});
