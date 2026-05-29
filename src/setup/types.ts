/**
 * Shared types for the multi-client MCP setup adapter system.
 *
 * @handbook 2.5-client-adapters
 */

export type GhostEnv = {
  GHOST_URL: string;
  GHOST_ADMIN_API_KEY: string;
};

export type RegisteredEntry = {
  command: string;
  args: string[];
  env: Partial<GhostEnv>;
};

export type ClientState =
  | { kind: 'in-sync'; entry: RegisteredEntry }
  | { kind: 'stale'; entry: RegisteredEntry; reasons: string[] }
  | { kind: 'missing' };

export interface McpClient {
  id: 'claude-code' | 'codex' | 'gemini';
  label: string;
  cli: string;
  addArgs(name: string, env: GhostEnv, cmd: string, cmdArgs: string[]): string[];
  getArgs(name: string): string[];
  removeArgs(name: string): string[];
  parseGet(stdout: string, name: string): RegisteredEntry | null;
}
