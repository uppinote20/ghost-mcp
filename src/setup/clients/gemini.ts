/**
 * Gemini CLI MCP adapter — wraps `gemini mcp add/list/remove`.
 *
 * Notes:
 * - Gemini has no `mcp get` subcommand, so getArgs delegates to `mcp list` and
 *   parseGet filters by name.
 * - `mcp add` requires `-s user` for global scope (default is 'project').
 *   removeArgs also passes `-s user` so we delete from the same scope add wrote
 *   to (otherwise Gemini falls back to the default `project` scope and fails).
 * - `mcp add` uses positional args (no `--` separator), unlike Claude Code / Codex.
 * - env is returned as `{}` to match the Claude Code and Codex adapter design.
 *
 * IMPORTANT — list output format is INFERRED, not live-verified.
 * Gemini CLI v0.38.0 (the version available at implementation time) produces
 * empty stdout for `gemini mcp list` even after `mcp add` has populated
 * `~/.gemini/settings.json`. The parser below assumes the Claude Code line
 * shape (`<name>: <cmd> [<args>] - <status>`); if the real format diverges,
 * `parseGet` returns null and the wizard classifies the server as `missing`,
 * which triggers a benign re-registration on the next setup run. Update the
 * fixture and parser the first time we see real output.
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
