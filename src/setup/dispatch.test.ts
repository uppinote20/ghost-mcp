/** @covers src/setup/dispatch.ts */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpClient, GhostEnv } from './types.js';
import * as proc from './process.js';
import { detect, read, write, remove, SERVER_NAME, CANONICAL_CMD, CANONICAL_ARGS } from './dispatch.js';

const mockClient: McpClient = {
  id: 'test',
  label: 'Test Client',
  cli: 'fake-cli',
  addArgs: (name, _env, cmd, args) => ['mcp', 'add', name, '--', cmd, ...args],
  getArgs: (name) => ['mcp', 'get', name],
  removeArgs: (name) => ['mcp', 'remove', name],
  parseGet: (stdout) => (stdout ? { command: 'npx', args: [], env: {} } : null),
};

const mockEnv: GhostEnv = {
  GHOST_URL: 'https://test.ghost.io',
  GHOST_ADMIN_API_KEY: 'test-key',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('dispatch', () => {
  describe('detect', () => {
    it('returns true when CLI returns status 0', () => {
      const spy = vi.spyOn(proc, 'run').mockReturnValue({
        status: 0,
        stdout: '1.0.0',
        stderr: '',
      });

      expect(detect(mockClient)).toBe(true);
      expect(spy).toHaveBeenCalledWith('fake-cli', ['--version']);
    });

    it('returns false when CLI is missing (status null + error)', () => {
      vi.spyOn(proc, 'run').mockReturnValue({
        status: null,
        stdout: '',
        stderr: 'not found',
      });

      expect(detect(mockClient)).toBe(false);
    });

    it('returns false when CLI exits non-zero', () => {
      vi.spyOn(proc, 'run').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error',
      });

      expect(detect(mockClient)).toBe(false);
    });
  });

  describe('read', () => {
    it('delegates to client.parseGet on successful status', () => {
      const stdout = 'test-content';
      const parseGetSpy = vi.spyOn(mockClient, 'parseGet').mockReturnValue({
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {},
      });

      vi.spyOn(proc, 'run').mockReturnValue({
        status: 0,
        stdout,
        stderr: '',
      });

      const result = read(mockClient);

      expect(result).toEqual({
        command: 'npx',
        args: ['-y', '@uppinote/ghost-mcp@latest'],
        env: {},
      });
      expect(parseGetSpy).toHaveBeenCalledWith(stdout, SERVER_NAME);
    });

    it('returns null when status non-zero and stdout empty', () => {
      vi.spyOn(proc, 'run').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error',
      });

      expect(read(mockClient)).toBeNull();
    });

    it('still calls parseGet when status non-zero but stdout non-empty', () => {
      const stdout = 'error message with content';
      const parseGetSpy = vi.spyOn(mockClient, 'parseGet').mockReturnValue(null);

      vi.spyOn(proc, 'run').mockReturnValue({
        status: 1,
        stdout,
        stderr: 'error',
      });

      read(mockClient);

      expect(parseGetSpy).toHaveBeenCalledWith(stdout, SERVER_NAME);
    });

    it('uses custom name when provided', () => {
      const getArgsSpy = vi.spyOn(mockClient, 'getArgs').mockReturnValue(['mcp', 'get', 'custom']);

      vi.spyOn(proc, 'run').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
      });

      read(mockClient, 'custom');

      expect(getArgsSpy).toHaveBeenCalledWith('custom');
    });
  });

  describe('write', () => {
    it('calls run with cli, addArgs, and stdio inherit', () => {
      const addArgsSpy = vi.spyOn(mockClient, 'addArgs').mockReturnValue(['mcp', 'add', 'ghost-blog', '--', 'npx', '-y', '@uppinote/ghost-mcp@latest']);
      const runSpy = vi.spyOn(proc, 'run').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
      });

      write(mockClient, mockEnv);

      expect(addArgsSpy).toHaveBeenCalledWith(SERVER_NAME, mockEnv, CANONICAL_CMD, CANONICAL_ARGS);
      expect(runSpy).toHaveBeenCalledWith(
        'fake-cli',
        ['mcp', 'add', 'ghost-blog', '--', 'npx', '-y', '@uppinote/ghost-mcp@latest'],
        { stdio: 'inherit' }
      );
    });

    it('throws on non-zero status with failing argv in message', () => {
      const args = ['mcp', 'add', 'ghost-blog', '--', 'npx'];
      vi.spyOn(mockClient, 'addArgs').mockReturnValue(args);
      vi.spyOn(proc, 'run').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error',
      });

      expect(() => write(mockClient, mockEnv)).toThrow(
        /fake-cli mcp add ghost-blog -- npx.*exited with status 1/
      );
    });

    it('uses custom name when provided', () => {
      const addArgsSpy = vi.spyOn(mockClient, 'addArgs').mockReturnValue(['mcp', 'add', 'custom', '--', 'npx']);
      vi.spyOn(proc, 'run').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
      });

      write(mockClient, mockEnv, 'custom');

      expect(addArgsSpy).toHaveBeenCalledWith('custom', mockEnv, CANONICAL_CMD, CANONICAL_ARGS);
    });
  });

  describe('remove', () => {
    it('calls run with removeArgs and stdio inherit', () => {
      const removeArgsSpy = vi.spyOn(mockClient, 'removeArgs').mockReturnValue(['mcp', 'remove', 'ghost-blog']);
      const runSpy = vi.spyOn(proc, 'run').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
      });

      remove(mockClient);

      expect(removeArgsSpy).toHaveBeenCalledWith(SERVER_NAME);
      expect(runSpy).toHaveBeenCalledWith(
        'fake-cli',
        ['mcp', 'remove', 'ghost-blog'],
        { stdio: 'inherit' }
      );
    });

    it('throws on non-zero status with failing argv in message', () => {
      const args = ['mcp', 'remove', 'ghost-blog'];
      vi.spyOn(mockClient, 'removeArgs').mockReturnValue(args);
      vi.spyOn(proc, 'run').mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'error',
      });

      expect(() => remove(mockClient)).toThrow(
        /fake-cli mcp remove ghost-blog.*exited with status 1/
      );
    });

    it('uses custom name when provided', () => {
      const removeArgsSpy = vi.spyOn(mockClient, 'removeArgs').mockReturnValue(['mcp', 'remove', 'custom']);
      vi.spyOn(proc, 'run').mockReturnValue({
        status: 0,
        stdout: '',
        stderr: '',
      });

      remove(mockClient, 'custom');

      expect(removeArgsSpy).toHaveBeenCalledWith('custom');
    });
  });
});
