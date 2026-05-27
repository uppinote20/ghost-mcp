/**
 * Adapter-independent orchestration over an McpClient.
 *
 * detect() — is the CLI binary present on PATH?
 * read()   — fetch the current ghost-blog registration (null if missing)
 * write()  — call `<cli> mcp add` with the canonical npx invocation
 * remove() — call `<cli> mcp remove`
 *
 * @handbook 2.4-setup-wizard
 */
import { McpClient, RegisteredEntry, GhostEnv } from './types.js';
import { run } from './process.js';

export const SERVER_NAME = 'ghost-blog';
export const CANONICAL_CMD = 'npx';
export const CANONICAL_ARGS = ['-y', '@uppinote/ghost-mcp@latest'];

export function detect(client: McpClient): boolean {
  const r = run(client.cli, ['--version']);
  return r.status === 0;
}

export function read(client: McpClient, name: string = SERVER_NAME): RegisteredEntry | null {
  const r = run(client.cli, client.getArgs(name));
  if (r.status !== 0 && !r.stdout) return null;
  return client.parseGet(r.stdout, name);
}

export function write(client: McpClient, env: GhostEnv, name: string = SERVER_NAME): void {
  const args = client.addArgs(name, env, CANONICAL_CMD, CANONICAL_ARGS);
  const r = run(client.cli, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(
      `${client.label}: \`${client.cli} ${args.join(' ')}\` exited with status ${r.status}`
    );
  }
}

export function remove(client: McpClient, name: string = SERVER_NAME): void {
  const args = client.removeArgs(name);
  const r = run(client.cli, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(
      `${client.label}: \`${client.cli} ${args.join(' ')}\` exited with status ${r.status}`
    );
  }
}
