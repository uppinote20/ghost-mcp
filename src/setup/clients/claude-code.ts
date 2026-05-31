/**
 * Claude Code MCP adapter — writes via `claude mcp add/remove`, but reads
 * registration state from ~/.claude.json directly.
 *
 * READ is file-based, not CLI-based. `claude mcp list` reports the *effective*
 * server (the highest-precedence scope), which can be a project/.mcp.json entry
 * — but the wizard only ever writes user scope (`-s user`). Reading the
 * effective scope makes the wizard misread a project override as "stale", then
 * fail to "fix" it: `mcp add -s user` errors "already exists" against the user
 * entry the effective read couldn't see. readEntry parses ~/.claude.json's
 * user-scope mcpServers instead, so read and write target the same scope. Writes
 * still go through the CLI (`mcp add` is fine).
 *
 * @handbook 2.5-client-adapters
 * @tested src/setup/clients/claude-code.test.ts
 */
import os from 'node:os';
import path from 'node:path';
import { readFromJsonConfig } from './json-config.js';
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
    // `name` MUST precede the -e flags. claude's `-e, --env <env...>` is variadic,
    // so a positional placed after the last -e is swallowed as an env value
    // ("Invalid environment variable format: <name>"). The `--` then terminates
    // the variadic so the command/args are not consumed either.
    // Canonical: claude mcp add [-s user] <name> -e KEY=val -- <cmd> <args...>
    return [
      'mcp',
      'add',
      '-s',
      'user',
      name,
      '-e',
      `GHOST_URL=${env.GHOST_URL}`,
      '-e',
      `GHOST_ADMIN_API_KEY=${env.GHOST_ADMIN_API_KEY}`,
      '--',
      cmd,
      ...cmdArgs,
    ];
  },

  removeArgs(name: string): string[] {
    return ['mcp', 'remove', '-s', 'user', name];
  },

  // Reads ~/.claude.json user-scope mcpServers — see the file header for why
  // `claude mcp list` (effective scope) is the wrong source for a wizard that
  // writes user scope.
  readEntry(name: string): RegisteredEntry | null {
    return readFromJsonConfig(path.join(os.homedir(), '.claude.json'), name);
  },
};
