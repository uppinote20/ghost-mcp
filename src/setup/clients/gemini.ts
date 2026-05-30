/**
 * Gemini CLI MCP adapter — writes via `gemini mcp add/remove`, but reads
 * registration state from `~/.gemini/settings.json` directly.
 *
 * Notes:
 * - `mcp add` requires `-s user` for global scope (default is 'project').
 *   removeArgs also passes `-s user` so we delete from the same scope add wrote
 *   to (otherwise Gemini falls back to the default `project` scope and fails).
 * - `mcp add` uses positional args (no `--` separator), unlike Claude Code / Codex.
 *
 * READ is file-based, not CLI-based. `gemini mcp list` (verified on v0.38.0) is
 * TTY-gated: it prints the server table only when stdout is a TTY and emits
 * *nothing* (0 bytes) when stdout is captured — which is exactly how the wizard
 * reads it (a captured pipe, not a TTY). There is no --json flag to force
 * machine-readable output, so the CLI is unusable for reads. readEntry parses
 * the user-scope settings file instead — the same file `gemini mcp add -s user`
 * writes to. Writes still go through the CLI (`mcp add` is not TTY-gated).
 *
 * @handbook 2.5-client-adapters
 * @tested src/setup/clients/gemini.test.ts
 */
import os from 'node:os';
import path from 'node:path';
import { readFromJsonConfig } from './json-config.js';
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

  removeArgs(name: string): string[] {
    return ['mcp', 'remove', '-s', 'user', name];
  },

  // Reads ~/.gemini/settings.json — see the file header for why `gemini mcp list`
  // is unusable (TTY-gated when captured).
  readEntry(name: string): RegisteredEntry | null {
    return readFromJsonConfig(path.join(os.homedir(), '.gemini', 'settings.json'), name);
  },
};
