/**
 * Adapter-independent orchestration over an McpClient.
 *
 * detect() — is the CLI binary present on PATH?
 * read()   — fetch the current ghost-blog registration (null if missing)
 * write()  — call `<cli> mcp add` with the canonical npx invocation
 * remove() — call `<cli> mcp remove`
 *
 * @handbook 2.5-client-adapters
 * @tested src/setup/dispatch.test.ts
 */
import { McpClient, RegisteredEntry, GhostEnv } from './types.js';
import { run } from './process.js';

export const SERVER_NAME = 'ghost-blog';
export const CANONICAL_CMD = 'npx';
export const CANONICAL_ARGS = ['-y', '@uppinote/ghost-mcp@latest'];

export async function detect(client: McpClient): Promise<boolean> {
  const r = await run(client.cli, ['--version']);
  return r.status === 0;
}

export async function read(
  client: McpClient,
  name: string = SERVER_NAME
): Promise<RegisteredEntry | null> {
  // Adapter-specific read (gemini reads its settings file — see gemini.ts).
  if (client.readEntry) return client.readEntry(name);
  // CLI-based read: run the list/get command and parse its stdout.
  if (!client.getArgs || !client.parseGet) return null;
  const r = await run(client.cli, client.getArgs(name));
  if (r.status !== 0 && !r.stdout) return null;
  return client.parseGet(r.stdout, name);
}

export async function write(
  client: McpClient,
  env: GhostEnv,
  name: string = SERVER_NAME,
  opts: { replace?: boolean } = {}
): Promise<void> {
  // replace = an entry already exists but differs. Most CLIs' `mcp add` refuses
  // to overwrite an existing name, so remove first. Best-effort: a stale entry
  // in a different scope than we write is a no-op here, and the add still succeeds.
  if (opts.replace) {
    try {
      await remove(client, name);
    } catch {
      // entry may live in another scope or already be gone — add handles it
    }
  }
  const args = client.addArgs(name, env, CANONICAL_CMD, CANONICAL_ARGS);
  const r = await run(client.cli, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    // Redact env values in the error message — addArgs embeds GHOST_ADMIN_API_KEY
    // and we don't want the API key leaking into terminal logs / clipboard / paste.
    const redactedArgs = args.map((a) =>
      /^(GHOST_URL|GHOST_ADMIN_API_KEY)=/.test(a) ? a.split('=')[0] + '=<redacted>' : a
    );
    throw new Error(
      `${client.label}: \`${client.cli} ${redactedArgs.join(' ')}\` exited with status ${r.status}`
    );
  }
}

export async function remove(
  client: McpClient,
  name: string = SERVER_NAME
): Promise<void> {
  const args = client.removeArgs(name);
  const r = await run(client.cli, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(
      `${client.label}: \`${client.cli} ${args.join(' ')}\` exited with status ${r.status}`
    );
  }
}
