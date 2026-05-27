/**
 * Claude Code MCP adapter — wraps `claude mcp add/list/remove`.
 *
 * Note: Claude Code's `mcp get` is human-readable text and does NOT expose env
 * vars (security masking). `mcp list` exposes each server's command and args
 * inline but also masks env. So we use `mcp list` for read, filter to the
 * target name, and leave env empty — drift on env cannot be detected from this
 * CLI surface, only on command/args (e.g. an old dev-clone `node /path/.../
 * dist/index.js` vs the canonical npx invocation).
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

  // Delegates to `mcp list` and then filters by name in parseGet.
  // `mcp get` cannot be used because the current Claude Code release emits
  // human-readable text without the command/args/env fields.
  getArgs(_name: string): string[] {
    return ['mcp', 'list'];
  },

  removeArgs(name: string): string[] {
    return ['mcp', 'remove', '-s', 'user', name];
  },

  parseGet(stdout: string, name: string): RegisteredEntry | null {
    if (!stdout || typeof stdout !== 'string') return null;

    // `mcp list` line shape (stdio):
    //   <name>: <command> [<arg> ...] - <status emoji + text>
    // HTTP entries end with "(HTTP)" or start with http(s)://; we skip those.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linePattern = new RegExp(`^${escaped}:\\s+(.+?)\\s+-\\s+`, 'm');

    const match = stdout.match(linePattern);
    if (!match) return null;

    const cmdAndArgs = match[1].trim();
    if (/\(HTTP\)$/.test(cmdAndArgs) || /^https?:\/\//.test(cmdAndArgs)) {
      return null;
    }

    const tokens = cmdAndArgs.split(/\s+/);
    const command = tokens[0];
    const args = tokens.slice(1);

    // env is intentionally empty — Claude Code masks it. classify treats an
    // empty registered env as "in-sync on env" so the wizard still detects
    // command/args drift (the v1.0.x → npx migration case).
    return { command, args, env: {} };
  },
};
