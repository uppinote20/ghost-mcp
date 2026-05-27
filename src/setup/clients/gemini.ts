/**
 * Gemini CLI MCP adapter — wraps `gemini mcp add/list/remove`.
 *
 * Notes:
 * - Gemini has no `mcp get` subcommand, so getArgs delegates to `mcp list` and
 *   parseGet filters by name.
 * - `mcp add` requires `-s user` for global scope (default is 'project').
 * - `mcp add` uses positional args (no `--` separator), unlike Claude Code / Codex.
 * - env is returned as `{}` to match the Claude Code and Codex adapter design.
 *
 * @handbook 2.4-setup-wizard
 */
import { McpClient, RegisteredEntry, GhostEnv } from '../types.js';

export const gemini: McpClient = {
  id: 'gemini',
  label: 'Gemini',
  cli: 'gemini',

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
      cmd,
      ...cmdArgs,
    ];
  },

  listArgs(): string[] {
    return ['mcp', 'list'];
  },

  // Delegates to `mcp list` and then filters by name in parseGet.
  // Gemini has no `mcp get` subcommand.
  getArgs(_name: string): string[] {
    return ['mcp', 'list'];
  },

  removeArgs(name: string): string[] {
    return ['mcp', 'remove', '-s', 'user', name];
  },

  parseGet(stdout: string, name: string): RegisteredEntry | null {
    if (!stdout) return null;

    // `mcp list` line shape (stdio):
    //   <name>: <command> [<arg> ...] - <status emoji + text>
    // We escape the name for regex safety and look for the target line.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linePattern = new RegExp(`^${escaped}:\\s+(.+?)\\s+-\\s+`, 'm');

    const match = stdout.match(linePattern);
    if (!match) return null;

    const cmdAndArgs = match[1].trim();
    const tokens = cmdAndArgs.split(/\s+/);
    const command = tokens[0];
    if (!command) return null;
    const args = tokens.slice(1);

    // env is intentionally empty — Gemini masks it. classify treats an
    // empty registered env as "in-sync on env" so the wizard still detects
    // command/args drift.
    return { command, args, env: {} };
  },
};
