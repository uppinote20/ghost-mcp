/**
 * Claude Code MCP adapter — wraps `claude mcp add/list/get/remove`.
 *
 * @handbook 2.4-setup-wizard
 */
import { McpClient, RegisteredEntry, GhostEnv } from '../types.js';

export const claudeCode: McpClient = {
  id: 'claude-code',
  label: 'Claude Code',
  cli: 'claude',

  addArgs(
    name: string,
    env: GhostEnv,
    cmd: string,
    cmdArgs: string[]
  ): string[] {
    return [
      'mcp',
      'add',
      '-s',
      'user',
      '-e',
      `GHOST_URL=${env.GHOST_URL}`,
      '-e',
      `GHOST_ADMIN_API_KEY=${env.GHOST_ADMIN_API_KEY}`,
      name,
      '--',
      cmd,
      ...cmdArgs,
    ];
  },

  listArgs(): string[] {
    return ['mcp', 'list'];
  },

  getArgs(name: string): string[] {
    return ['mcp', 'get', name, '--json'];
  },

  removeArgs(name: string): string[] {
    return ['mcp', 'remove', '-s', 'user', name];
  },

  parseGet(stdout: string, _name: string): RegisteredEntry | null {
    if (!stdout || typeof stdout !== 'string') {
      return null;
    }

    try {
      const data = JSON.parse(stdout) as unknown;

      // Validate shape: must have command field that is a string
      if (
        typeof data === 'object' &&
        data !== null &&
        'command' in data &&
        typeof (data as Record<string, unknown>).command === 'string'
      ) {
        const parsed = data as Record<string, unknown>;
        return {
          command: parsed.command as string,
          args: Array.isArray(parsed.args) ? parsed.args : [],
          env:
            typeof parsed.env === 'object' && parsed.env !== null
              ? (parsed.env as Partial<GhostEnv>)
              : {},
        };
      }

      return null;
    } catch {
      // JSON.parse failed or any other error
      return null;
    }
  },
};
