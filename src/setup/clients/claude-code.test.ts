/** @covers src/setup/clients/claude-code.ts */
import { describe, it, expect } from 'vitest';
import { claudeCode } from './claude-code.js';

// Fixture mirrors real `claude mcp list` output captured from a working install.
// Contains: target stdio entry, another stdio entry, and an HTTP entry to verify
// the parser skips HTTP and picks the right name.
const LIST_FIXTURE = `Checking MCP server health…

plugin:context7:context7: npx -y @upstash/context7-mcp - ✓ Connected
plugin:sentry:sentry: https://mcp.sentry.dev/mcp (HTTP) - ! Needs authentication
ghost-blog: npx -y @uppinote/ghost-mcp@latest - ✓ Connected
nanobanana: node /Users/kim/.gemini/extensions/nanobanana/mcp-server/dist/index.js - ✓ Connected
`;

const DEV_CLONE_FIXTURE = `ghost-blog: node /Users/kim/Desktop/Project/_shipped/ghost-mcp/dist/index.js - ✓ Connected\n`;

describe('claudeCode adapter', () => {
  describe('addArgs', () => {
    it('generates user-scoped argv with -e env flags and -- separator', () => {
      const result = claudeCode.addArgs(
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
        '--',
        'npx', '-y', '@uppinote/ghost-mcp@latest',
      ]);
    });
  });

  describe('listArgs', () => {
    it('returns mcp list argv', () => {
      expect(claudeCode.listArgs()).toEqual(['mcp', 'list']);
    });
  });

  describe('getArgs', () => {
    it('delegates to mcp list because the CLI mcp get omits config detail', () => {
      expect(claudeCode.getArgs('ghost-blog')).toEqual(['mcp', 'list']);
    });
  });

  describe('removeArgs', () => {
    it('uses -s user scope to target the same registration as add', () => {
      expect(claudeCode.removeArgs('ghost-blog')).toEqual([
        'mcp', 'remove', '-s', 'user', 'ghost-blog',
      ]);
    });
  });

  describe('parseGet', () => {
    it('extracts command and args for the target name from list output', () => {
      const result = claudeCode.parseGet(LIST_FIXTURE, 'ghost-blog');
      expect(result).toEqual({
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {},
      });
    });

    it('extracts dev-clone style command + path arg (the v1.0.x migration case)', () => {
      const result = claudeCode.parseGet(DEV_CLONE_FIXTURE, 'ghost-blog');
      expect(result).toEqual({
        command: 'node',
        args: ['/Users/kim/Desktop/Project/_shipped/ghost-mcp/dist/index.js'],
        env: {},
      });
    });

    it('always leaves env empty because Claude Code masks env in list output', () => {
      const result = claudeCode.parseGet(LIST_FIXTURE, 'ghost-blog');
      expect(result?.env).toEqual({});
    });

    it('returns null when the target name is absent from the list', () => {
      expect(claudeCode.parseGet(LIST_FIXTURE, 'not-registered')).toBeNull();
    });

    it('returns null for empty stdout', () => {
      expect(claudeCode.parseGet('', 'ghost-blog')).toBeNull();
    });

    it('returns null when the target line is an HTTP entry (not stdio)', () => {
      const httpFixture = `ghost-blog: https://example.com/mcp (HTTP) - ✓ Connected\n`;
      expect(claudeCode.parseGet(httpFixture, 'ghost-blog')).toBeNull();
    });
  });
});
