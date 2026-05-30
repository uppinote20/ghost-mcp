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
  id: string; // stable selection key (Set membership); not dispatched on
  label: string;
  cli: string;
  addArgs(name: string, env: GhostEnv, cmd: string, cmdArgs: string[]): string[];
  removeArgs(name: string): string[];
  // Read path — most adapters expose it via the CLI (getArgs + parseGet); gemini
  // overrides with readEntry because `gemini mcp list` is TTY-gated (emits nothing
  // when its stdout is captured) and has no --json flag, so it reads its config
  // file directly instead.
  getArgs?(name: string): string[];
  parseGet?(stdout: string, name: string): RegisteredEntry | null;
  readEntry?(name: string): RegisteredEntry | null;
}
