/**
 * Interactive setup for ghost-mcp.
 * Registers the MCP server across all detected MCP-capable CLIs using first-party
 * `mcp add` commands — no direct JSON-file writes.
 *
 * Invoked via:
 *   npx -y @uppinote/ghost-mcp@latest setup
 *   npm run setup            (dev: same code path, just a shorter alias)
 *
 * Flags:
 *   --yes               non-interactive; skips star prompt
 *   --star              star without prompting (dotfiles / CI consent)
 *   --force-star-prompt re-ask even if already prompted
 *
 * @handbook 2.4-setup-wizard
 * @tested src/setup.test.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  intro,
  outro,
  text,
  password,
  multiselect,
  confirm,
  note,
  cancel,
  isCancel,
  log,
} from '@clack/prompts';
import { checkGhostUrl, checkGhostKey } from './validation.js';
import { ALL_CLIENTS } from './setup/clients/index.js';
import { detect, read, write, SERVER_NAME } from './setup/dispatch.js';
import { classify, resolveCanonical } from './setup/classify.js';
import { McpClient, ClientState, GhostEnv } from './setup/types.js';

const REPO = 'uppinote20/ghost-mcp';
const REPO_URL = `https://github.com/${REPO}`;

// ── Helpers ──────────────────────────────────────

const HOME = os.homedir();
const STAR_MARKER = path.join(HOME, '.config', 'ghost-mcp', '.star-prompted');

type ScanRow = { client: McpClient; state: ClientState };

function scan(): ScanRow[] {
  const detected = ALL_CLIENTS.filter(detect);
  const stub: GhostEnv = { GHOST_URL: '', GHOST_ADMIN_API_KEY: '' };
  return detected.map((client) => ({
    client,
    state: classify(stub, read(client)),
  }));
}

function reclassify(rows: ScanRow[], canonical: GhostEnv): ScanRow[] {
  return rows.map(({ client, state }) => {
    if (state.kind === 'missing') return { client, state };
    return { client, state: classify(canonical, state.entry) };
  });
}

function symbol(state: ClientState): string {
  switch (state.kind) {
    case 'in-sync': return '✓';
    case 'stale':   return '⚠';
    case 'missing': return '○';
  }
}

function summary(state: ClientState): string {
  switch (state.kind) {
    case 'in-sync': return 'in-sync';
    case 'stale':   return `stale — ${state.reasons[0]}`;
    case 'missing': return 'not registered';
  }
}

function renderRows(rows: ScanRow[]): void {
  const lines = rows.map(({ client, state }) =>
    `  ${symbol(state)}  ${client.label.padEnd(14)}  ${summary(state)}`
  );
  note(lines.join('\n'), 'MCP clients');
}

function bail(msg: string): never {
  cancel(msg);
  process.exit(0);
}

function check<T>(value: T | symbol): T {
  if (isCancel(value)) bail('Setup cancelled.');
  return value as T;
}

function ghAvailable(): boolean {
  const r = spawnSync('gh', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

function ghAuthed(): boolean {
  const r = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  return r.status === 0;
}

function markStarPrompted(): void {
  try {
    fs.mkdirSync(path.dirname(STAR_MARKER), { recursive: true });
    fs.writeFileSync(STAR_MARKER, '');
  } catch {
    // best effort — marker is an optimization, not a correctness requirement
  }
}

function tryStar(): void {
  if (!ghAvailable()) {
    log.info(`\`gh\` CLI not found. Star manually at:\n  ${REPO_URL}`);
    return;
  }
  if (!ghAuthed()) {
    log.info(
      `\`gh\` not authenticated. Run \`gh auth login\` then star at:\n  ${REPO_URL}`
    );
    return;
  }

  // `gh repo star` subcommand does not exist. Use the REST API directly:
  // PUT /user/starred/{owner}/{repo}.
  const r = spawnSync(
    'gh',
    ['api', '--method', 'PUT', '--silent', `/user/starred/${REPO}`],
    { stdio: ['ignore', 'ignore', 'ignore'] }
  );
  if (r.status === 0) {
    log.success('★ Thanks!');
  } else {
    log.info(`(star failed — you can star manually at\n  ${REPO_URL})`);
  }
}

interface StarFlags {
  yes: boolean;
  star: boolean;
  forceStarPrompt: boolean;
}

async function offerStar(flags: StarFlags): Promise<void> {
  // --star: explicit opt-in, no prompt (dotfiles / CI consent)
  if (flags.star) {
    tryStar();
    markStarPrompted();
    return;
  }

  // --yes: non-interactive; star is always prompt-only, so skip
  if (flags.yes) return;

  // Already asked once; stay quiet unless user forces re-prompt
  if (fs.existsSync(STAR_MARKER) && !flags.forceStarPrompt) return;

  // Mark before prompting so Ctrl+C is treated as "No" — prevents re-asking
  // on the next run when setup itself already succeeded.
  markStarPrompted();

  const yes = await confirm({
    message:
      `If ghost-mcp helped you, a GitHub star makes it discoverable to ` +
      `other Claude Code users. Would you like me to star it now?`,
    initialValue: false,
  });

  if (isCancel(yes)) return;
  if (yes) tryStar();
}

// ── Main ─────────────────────────────────────────

export async function runSetup(): Promise<void> {
  // Parse flags lazily so importing this module (e.g. from tests) has no
  // process.argv side-effects.
  const args = new Set(process.argv.slice(2));
  const flagYes = args.has('--yes');
  const flagStar = args.has('--star');
  const flagForceStarPrompt = args.has('--force-star-prompt');

  // 1. Intro
  intro('ghost-mcp setup');

  // 2. SCAN — detect all installed MCP CLIs and their current registration state
  const rows = scan();

  if (rows.length === 0) {
    note(
      'No supported MCP CLI detected (Claude Code, Codex CLI, Gemini CLI).\nInstall one of them first.',
      'No clients found'
    );
    outro('No changes made.');
    return;
  }

  renderRows(rows);

  // 3. RESOLVE CANONICAL (initial) — from any in-sync entries
  const inSyncEnvs = rows
    .filter((r) => r.state.kind === 'in-sync')
    .map((r) => {
      const s = r.state;
      if (s.kind !== 'in-sync') return null;
      // Adapters that mask env return env={} — coerce missing fields to ''
      // so resolveCanonical's strict equality does not key on undefined.
      return {
        GHOST_URL: s.entry.env.GHOST_URL ?? '',
        GHOST_ADMIN_API_KEY: s.entry.env.GHOST_ADMIN_API_KEY ?? '',
      };
    })
    .filter((e): e is GhostEnv => e !== null);

  const initialCanon = resolveCanonical(inSyncEnvs);

  if (initialCanon === 'conflict') {
    note(
      'In-sync clients have disagreeing values — you will choose the canonical values below.',
      'Conflict detected'
    );
  }

  const defaultUrl =
    initialCanon && initialCanon !== 'conflict' ? initialCanon.GHOST_URL : '';
  const defaultKey =
    initialCanon && initialCanon !== 'conflict'
      ? initialCanon.GHOST_ADMIN_API_KEY
      : '';

  // 4. PROMPT URL + KEY
  const ghostUrl = check(
    await text({
      message: 'Ghost blog URL',
      placeholder: 'https://your-blog.com',
      initialValue: defaultUrl,
      validate: checkGhostUrl,
    })
  );

  const apiKey = check(
    await password({
      message: 'Admin API Key (Ghost → Settings → Integrations)',
      mask: '*',
      validate: (v) => {
        // Allow pressing Enter to keep the canonical key (only when one exists).
        // Without this `defaultKey &&` guard, empty input would silently match
        // an empty default — first-time setup users could submit a blank key.
        if (defaultKey && v === defaultKey) return undefined;
        return checkGhostKey(v);
      },
    })
  );

  const canonical: GhostEnv = {
    GHOST_URL: ghostUrl.replace(/\/$/, ''),
    GHOST_ADMIN_API_KEY: apiKey || defaultKey,
  };

  // 5. RECLASSIFY against final canonical
  const finalRows = reclassify(rows, canonical);

  // 6. MULTISELECT — which clients to update
  const options = finalRows
    .map((r) => ({
      value: r.client.id,
      label: `${r.client.label} (${summary(r.state)})`,
      hint: r.state.kind === 'in-sync' ? 'skip — already in-sync' : undefined,
    }));

  const selected = check(
    await multiselect({
      message: 'Apply to',
      options,
      initialValues: options.map((o) => o.value),
      required: false,
    })
  );

  const selectedIds = new Set(selected);

  // 7. APPLY — skip in-sync entries per spec §8.2
  let applied = 0;
  let skipped = 0;
  const failures: Array<{ client: McpClient; error: unknown }> = [];

  for (const { client, state } of finalRows) {
    if (!selectedIds.has(client.id)) continue;
    if (state.kind === 'in-sync') {
      skipped++;
      continue;
    }
    try {
      write(client, canonical, SERVER_NAME);
      applied++;
    } catch (e) {
      failures.push({ client, error: e });
    }
  }

  // 8. REPORT
  const reportLines: string[] = [];
  if (applied > 0) reportLines.push(`✓  Applied to ${applied} client(s)`);
  if (skipped > 0) reportLines.push(`○  Skipped ${skipped} already in-sync`);
  if (failures.length > 0) {
    reportLines.push(`✗  Failed: ${failures.map((f) => f.client.label).join(', ')}`);
    for (const { client, error } of failures) {
      log.error(`${client.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (reportLines.length > 0) note(reportLines.join('\n'), 'Result');

  // 9. Star prompt
  await offerStar({ yes: flagYes, star: flagStar, forceStarPrompt: flagForceStarPrompt });

  // 10. Outro with restart list
  const restartClients = finalRows
    .filter((r) => selectedIds.has(r.client.id) && r.state.kind !== 'in-sync')
    .map((r) => r.client.label);

  if (restartClients.length > 0) {
    outro(`Restart ${restartClients.join(', ')} to activate the MCP server.`);
  } else {
    outro('Done.');
  }
}
