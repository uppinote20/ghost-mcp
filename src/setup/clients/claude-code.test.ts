/** @covers src/setup/clients/claude-code.ts */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { claudeCode } from './claude-code.js';

afterEach(() => vi.restoreAllMocks());

describe('claudeCode adapter', () => {
  describe('addArgs', () => {
    it('puts the name before the variadic -e flags so it is not consumed as env', () => {
      const result = claudeCode.addArgs(
        'ghost-blog',
        { GHOST_URL: 'https://blog.example.com', GHOST_ADMIN_API_KEY: 'id:secret' },
        'npx',
        ['-y', '@uppinote/ghost-mcp@latest']
      );

      // claude's `-e, --env <env...>` is variadic: a name placed after the last
      // -e is swallowed as an env value. name must precede -e; -- ends the variadic.
      expect(result).toEqual([
        'mcp', 'add',
        '-s', 'user',
        'ghost-blog',
        '-e', 'GHOST_URL=https://blog.example.com',
        '-e', 'GHOST_ADMIN_API_KEY=id:secret',
        '--',
        'npx', '-y', '@uppinote/ghost-mcp@latest',
      ]);
    });
  });

  describe('removeArgs', () => {
    it('uses -s user scope to target the same registration as add', () => {
      expect(claudeCode.removeArgs('ghost-blog')).toEqual([
        'mcp', 'remove', '-s', 'user', 'ghost-blog',
      ]);
    });
  });

  // Edge cases (missing/malformed/absent) live in json-config.test.ts; here we
  // just confirm claude wires the right user-scope config path.
  describe('readEntry', () => {
    it('reads ~/.claude.json user-scope mcpServers for the target server', () => {
      const spy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          mcpServers: { 'ghost-blog': { command: 'npx', args: ['-y', '@uppinote/ghost-mcp@latest'] } },
        })
      );

      expect(claudeCode.readEntry!('ghost-blog')).toEqual({
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {},
      });
      expect(String(spy.mock.calls[0]?.[0])).toMatch(/\.claude\.json$/);
    });
  });
});
