/**
 * Codex CLI MCP adapter — wraps `codex mcp add/list/get/remove`.
 *
 * Note: Codex stores MCP servers globally in ~/.codex/config.toml (no scope
 * concept, unlike Claude Code which has user/workspace/workspace-user scopes).
 * `codex mcp get <name>` returns structured output (enabled, command, args, env, etc.)
 * with env values masked as *****. We parse the get output and leave env empty in
 * the returned RegisteredEntry. classify.ts treats empty registered env as
 * "in-sync on env" so drift detection focuses on command/args.
 *
 * @handbook 2.5-client-adapters
 * @tested src/setup/clients/codex.test.ts
 */
import { McpClient, RegisteredEntry, GhostEnv } from '../types.js';

export const codex: McpClient = {
  id: 'codex',
  label: 'Codex',
  cli: 'codex',

  addArgs(
    name: string,
    env: GhostEnv,
    cmd: string,
    cmdArgs: string[]
  ): string[] {
    return [
      'mcp',
      'add',
      '--env',
      `GHOST_URL=${env.GHOST_URL}`,
      '--env',
      `GHOST_ADMIN_API_KEY=${env.GHOST_ADMIN_API_KEY}`,
      name,
      '--',
      cmd,
      ...cmdArgs,
    ];
  },

  getArgs(name: string): string[] {
    return ['mcp', 'get', name];
  },

  removeArgs(name: string): string[] {
    return ['mcp', 'remove', name];
  },

  parseGet(stdout: string, name: string): RegisteredEntry | null {
    if (!stdout) return null;

    // If the server is not found, codex returns:
    //   Error: No MCP server named '<name>' found.
    if (stdout.includes('Error: No MCP server named')) {
      return null;
    }

    // Parse `codex mcp get <name>` output format:
    //   <name>
    //     enabled: <bool>
    //     transport: <type>
    //     command: <path-or-binary>
    //     args: <space-separated-args-or-dash>
    //     cwd: <path-or-dash>
    //     env: <comma-separated-KEY=VALUE-pairs-with-masked-values>
    //     remove: <command>

    // Extract the command line
    const commandMatch = stdout.match(/^\s+command:\s+(.+?)$/m);
    if (!commandMatch) return null;
    const command = commandMatch[1].trim();

    // Extract the args line
    const argsMatch = stdout.match(/^\s+args:\s+(.+?)$/m);
    if (!argsMatch) return null;
    const argsStr = argsMatch[1].trim();

    // If args is "-", treat as no args
    let args: string[] = [];
    if (argsStr !== '-') {
      // Split on whitespace. NOTE: mangles any arg containing a space (e.g. a
      // path like "/my docs/server.js"). Safe for the canonical
      // `-y @uppinote/ghost-mcp@latest`; revisit if codex's output format changes.
      args = argsStr.split(/\s+/);
    }

    // env is intentionally empty — Codex masks values with *****. classify treats
    // empty registered env as "in-sync on env" so drift detection focuses on
    // command/args.
    return { command, args, env: {} };
  },
};
