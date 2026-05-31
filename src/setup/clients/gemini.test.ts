/** @covers src/setup/clients/gemini.ts */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { gemini } from './gemini.js';

afterEach(() => vi.restoreAllMocks());

describe('gemini adapter', () => {
  describe('addArgs', () => {
    it('generates argv with -s user scope, -e short env flags, and positional args (no -- separator)', () => {
      const result = gemini.addArgs(
        'ghost-blog',
        { GHOST_URL: 'https://blog.example.com', GHOST_ADMIN_API_KEY: 'id:secret' },
        'npx',
        ['-y', '@uppinote/ghost-mcp@latest']
      );

      expect(result).toEqual([
        'mcp', 'add',
        '-s', 'user',
        '-e', 'GHOST_URL=https://blog.example.com',
        '-e', 'GHOST_ADMIN_API_KEY=id:secret',
        'ghost-blog',
        'npx', '-y', '@uppinote/ghost-mcp@latest',
      ]);
    });
  });

  describe('removeArgs', () => {
    it('uses explicit -s user scope to match the scope used in add', () => {
      expect(gemini.removeArgs('ghost-blog')).toEqual([
        'mcp', 'remove', '-s', 'user', 'ghost-blog',
      ]);
    });
  });

  // Edge cases (missing/malformed/absent) live in json-config.test.ts; here we
  // just confirm gemini wires the right settings-file path.
  describe('readEntry', () => {
    it('reads ~/.gemini/settings.json for the target server', () => {
      const spy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          mcpServers: { 'ghost-blog': { command: 'npx', args: ['-y', '@uppinote/ghost-mcp@latest'] } },
        })
      );

      expect(gemini.readEntry!('ghost-blog')).toEqual({
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {},
      });
      expect(String(spy.mock.calls[0]?.[0])).toMatch(/\.gemini[/\\]settings\.json$/);
    });
  });
});
