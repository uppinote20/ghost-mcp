/** @covers src/setup/clients/gemini.ts */
import { describe, it, expect } from 'vitest';
import { gemini } from './gemini.js';

// IMPORTANT — fixture is INFERRED-shape (Claude Code-style
// `<name>: <cmd> - <status>`), NOT captured from a real `gemini mcp list`.
// Live attempts on Gemini CLI v0.38.0 produced empty stdout even after
// `mcp add`, so we cannot lock the real format yet. Tests below confirm the
// parser works against the inferred shape (the contract); the first time a
// real output is observed, update this fixture and re-run the suite.
const LIST_FIXTURE = `Registered MCP Servers:

ghost-blog: npx -y @uppinote/ghost-mcp@latest - ✓ Connected
context7: npx -y @upstash/context7-mcp - ✓ Connected
`;

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
        'mcp',
        'add',
        '-s',
        'user',
        '-e',
        'GHOST_URL=https://blog.example.com',
        '-e',
        'GHOST_ADMIN_API_KEY=id:secret',
        'ghost-blog',
        'npx',
        '-y',
        '@uppinote/ghost-mcp@latest',
      ]);
    });
  });

  describe('getArgs', () => {
    it('delegates to mcp list because Gemini has no mcp get subcommand', () => {
      expect(gemini.getArgs('ghost-blog')).toEqual(['mcp', 'list']);
    });
  });

  describe('removeArgs', () => {
    it('uses explicit -s user scope to match the scope used in add', () => {
      expect(gemini.removeArgs('ghost-blog')).toEqual([
        'mcp',
        'remove',
        '-s',
        'user',
        'ghost-blog',
      ]);
    });
  });

  describe('parseGet', () => {
    it('extracts command and args for the target name from list output', () => {
      const result = gemini.parseGet(LIST_FIXTURE, 'ghost-blog');
      expect(result).toEqual({
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {},
      });
    });

    it('always leaves env empty because Gemini masks env in list output', () => {
      const result = gemini.parseGet(LIST_FIXTURE, 'ghost-blog');
      expect(result?.env).toEqual({});
    });

    it('returns null when the target name is absent from the list', () => {
      expect(gemini.parseGet(LIST_FIXTURE, 'not-registered')).toBeNull();
    });

    it('returns null for empty stdout', () => {
      expect(gemini.parseGet('', 'ghost-blog')).toBeNull();
    });
  });
});
