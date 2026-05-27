/** @covers src/setup/clients/codex.ts */
import { describe, it, expect } from 'vitest';
import { codex } from './codex.js';

// Fixture mirrors real `codex mcp get xcodebuildmcp` output (captured 2025-05-27).
const GET_FIXTURE = `xcodebuildmcp
  enabled: true
  transport: stdio
  command: npx
  args: -y xcodebuildmcp@latest mcp
  cwd: -
  env: XCODEBUILDMCP_ENABLED_WORKFLOWS=*****
  remove: codex mcp remove xcodebuildmcp`;

// Fixture with no args (e.g., command-only server)
const GET_FIXTURE_NO_ARGS = `node_repl
  enabled: true
  transport: stdio
  command: /Applications/Codex.app/Contents/Resources/node_repl
  args: -
  cwd: -
  env: BROWSER_USE_AVAILABLE_BACKENDS=*****, CODEX_HOME=*****
  remove: codex mcp remove node_repl`;

describe('codex adapter', () => {
  describe('addArgs', () => {
    it('generates argv with --env long flags, -- separator, and no scope', () => {
      const result = codex.addArgs(
        'ghost-blog',
        { GHOST_URL: 'https://blog.example.com', GHOST_ADMIN_API_KEY: 'id:secret' },
        'npx',
        ['-y', '@uppinote/ghost-mcp@latest']
      );

      expect(result).toEqual([
        'mcp',
        'add',
        '--env',
        'GHOST_URL=https://blog.example.com',
        '--env',
        'GHOST_ADMIN_API_KEY=id:secret',
        'ghost-blog',
        '--',
        'npx',
        '-y',
        '@uppinote/ghost-mcp@latest',
      ]);
    });
  });

  describe('listArgs', () => {
    it('returns mcp list argv', () => {
      expect(codex.listArgs()).toEqual(['mcp', 'list']);
    });
  });

  describe('getArgs', () => {
    it('returns mcp get argv with the server name', () => {
      expect(codex.getArgs('ghost-blog')).toEqual(['mcp', 'get', 'ghost-blog']);
    });
  });

  describe('removeArgs', () => {
    it('returns mcp remove argv (no scope, Codex stores globally)', () => {
      expect(codex.removeArgs('ghost-blog')).toEqual(['mcp', 'remove', 'ghost-blog']);
    });
  });

  describe('parseGet', () => {
    it('extracts command and args from codex mcp get output', () => {
      const result = codex.parseGet(GET_FIXTURE, 'xcodebuildmcp');
      expect(result).toEqual({
        command: 'npx',
        args: ['-y', 'xcodebuildmcp@latest', 'mcp'],
        env: {},
      });
    });

    it('handles command-only server (args: -) by returning empty args array', () => {
      const result = codex.parseGet(GET_FIXTURE_NO_ARGS, 'node_repl');
      expect(result).toEqual({
        command: '/Applications/Codex.app/Contents/Resources/node_repl',
        args: [],
        env: {},
      });
    });

    it('always leaves env empty because Codex masks env values with *****', () => {
      const result = codex.parseGet(GET_FIXTURE, 'xcodebuildmcp');
      expect(result?.env).toEqual({});
    });

    it('returns null when the output is empty', () => {
      expect(codex.parseGet('', 'xcodebuildmcp')).toBeNull();
    });

    it('returns null when the server is not found (Error: No MCP server...)', () => {
      const errorOutput = "Error: No MCP server named 'not-registered' found.";
      expect(codex.parseGet(errorOutput, 'not-registered')).toBeNull();
    });

    it('returns null when the command line is missing from the output', () => {
      const malformedOutput = `xcodebuildmcp
  enabled: true
  transport: stdio`;
      expect(codex.parseGet(malformedOutput, 'xcodebuildmcp')).toBeNull();
    });
  });
});
