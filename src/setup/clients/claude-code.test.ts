/** @covers src/setup/clients/claude-code.ts */
import { describe, it, expect } from 'vitest';
import { claudeCode } from './claude-code.js';

describe('claudeCode adapter', () => {
  describe('addArgs', () => {
    it('generates correct argv for mcp add with env flags and user scope', () => {
      const result = claudeCode.addArgs('ghost-blog', {
        GHOST_URL: 'https://blog.example.com',
        GHOST_ADMIN_API_KEY: 'id:secret',
      }, 'npx', ['-y', '@uppinote/ghost-mcp@latest']);

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
    it('generates correct argv for mcp list', () => {
      const result = claudeCode.listArgs();
      expect(result).toEqual(['mcp', 'list']);
    });
  });

  describe('getArgs', () => {
    it('generates correct argv for mcp get with --json flag', () => {
      const result = claudeCode.getArgs('ghost-blog');
      expect(result).toEqual(['mcp', 'get', 'ghost-blog', '--json']);
    });
  });

  describe('removeArgs', () => {
    it('generates correct argv for mcp remove with user scope', () => {
      const result = claudeCode.removeArgs('ghost-blog');
      expect(result).toEqual(['mcp', 'remove', '-s', 'user', 'ghost-blog']);
    });
  });

  describe('parseGet', () => {
    it('parses valid JSON with command field and returns RegisteredEntry', () => {
      const stdout = JSON.stringify({
        name: 'ghost-blog',
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {
          GHOST_URL: 'https://blog.example.com',
          GHOST_ADMIN_API_KEY: 'id:secret',
        },
      });

      const result = claudeCode.parseGet(stdout, 'ghost-blog');
      expect(result).toEqual({
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {
          GHOST_URL: 'https://blog.example.com',
          GHOST_ADMIN_API_KEY: 'id:secret',
        },
      });
    });

    it('returns null for empty stdout', () => {
      const result = claudeCode.parseGet('', 'ghost-blog');
      expect(result).toBeNull();
    });

    it('returns null for non-JSON stdout', () => {
      const result = claudeCode.parseGet('No MCP server found.', 'ghost-blog');
      expect(result).toBeNull();
    });
  });
});
