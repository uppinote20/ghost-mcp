/** @covers src/setup/clients/json-config.ts */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { readFromJsonConfig } from './json-config.js';

afterEach(() => vi.restoreAllMocks());

describe('readFromJsonConfig', () => {
  it('extracts command and args for the target server, env left empty', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({
        mcpServers: {
          'ghost-blog': {
            command: 'npx',
            args: ['-y', '@uppinote/ghost-mcp@latest'],
            env: { GHOST_URL: 'https://blog.example.com', GHOST_ADMIN_API_KEY: 'id:secret' },
          },
        },
      })
    );
    expect(readFromJsonConfig('/cfg.json', 'ghost-blog')).toEqual({
      command: 'npx',
      args: ['-y', '@uppinote/ghost-mcp@latest'],
      env: {},
    });
  });

  it('returns null when the server is absent from the file', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ mcpServers: { other: { command: 'node', args: [] } } })
    );
    expect(readFromJsonConfig('/cfg.json', 'ghost-blog')).toBeNull();
  });

  it('returns null when the file is missing', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    expect(readFromJsonConfig('/cfg.json', 'ghost-blog')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{ not json');
    expect(readFromJsonConfig('/cfg.json', 'ghost-blog')).toBeNull();
  });

  it('defaults args to [] when the entry omits them', () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ mcpServers: { 'ghost-blog': { command: 'npx' } } })
    );
    expect(readFromJsonConfig('/cfg.json', 'ghost-blog')).toEqual({
      command: 'npx',
      args: [],
      env: {},
    });
  });
});
