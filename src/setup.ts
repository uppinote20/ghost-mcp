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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  spinner,
} from '@clack/prompts';
import { checkGhostUrl, checkGhostKey } from './validation.js';
import { ALL_CLIENTS } from './setup/clients/index.js';
import { run } from './setup/process.js';
import { detect, read, write, SERVER_NAME } from './setup/dispatch.js';
import { classify, resolveCanonical } from './setup/classify.js';
import { McpClient, ClientState, GhostEnv } from './setup/types.js';

const REPO = 'uppinote20/ghost-mcp';
const REPO_URL = `https://github.com/${REPO}`;

// ── Helpers ──────────────────────────────────────

const HOME = os.homedir();
const STAR_MARKER = path.join(HOME, '.config', 'ghost-mcp', '.star-prompted');

// Calm line spinner (| / - \) at a relaxed cadence, instead of clack's default
// fast ◒◐◓◑ rotation which reads as busy.
const SPINNER_FRAMES = ['|', '/', '-', '\\'];
const SPINNER_DELAY = 180;

type ScanRow = { client: McpClient; state: ClientState };

// Probe one client. Returns null if its CLI is not installed, otherwise the
// current registration state (classified against a stub env — adapters mask env,
// so only command/args drift matters until the user supplies the canonical env).
async function probe(client: McpClient): Promise<ClientState | null> {
  if (!(await detect(client))) return null;
  const stub: GhostEnv = { GHOST_URL: '', GHOST_ADMIN_API_KEY: '' };
  return classify(stub, await read(client));
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

function bail(msg: string): never {
  cancel(msg);
  process.exit(0);
}

function check<T>(value: T | symbol): T {
  if (isCancel(value)) bail('Setup cancelled.');
  return value as T;
}

async function ghAvailable(): Promise<boolean> {
  return (await run('gh', ['--version'], { stdio: 'ignore' })).status === 0;
}

async function ghAuthed(): Promise<boolean> {
  return (await run('gh', ['auth', 'status'], { stdio: 'ignore' })).status === 0;
}

function markStarPrompted(): void {
  try {
    fs.mkdirSync(path.dirname(STAR_MARKER), { recursive: true });
    fs.writeFileSync(STAR_MARKER, '');
  } catch {
    // best effort — marker is an optimization, not a correctness requirement
  }
}

async function tryStar(): Promise<void> {
  if (!(await ghAvailable())) {
    log.info(`\`gh\` CLI not found. Star manually at:\n  ${REPO_URL}`);
    return;
  }
  if (!(await ghAuthed())) {
    log.info(
      `\`gh\` not authenticated. Run \`gh auth login\` then star at:\n  ${REPO_URL}`
    );
    return;
  }

  // `gh repo star` subcommand does not exist. Use the REST API directly:
  // PUT /user/starred/{owner}/{repo}.
  const r = await run(
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
    await tryStar();
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
  if (yes) await tryStar();
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

  // 2. SCAN — probe each supported client one at a time, reporting progress.
  // Each probe is an async CLI spawn (claude --version, mcp list, …), so a
  // per-client spinner gives a live "checking X… → result" trail instead of a
  // silent pause. Not-installed clients are shown too, then dropped from `rows`.
  const rows: ScanRow[] = [];
  const total = ALL_CLIENTS.length;
  for (let i = 0; i < total; i++) {
    const client = ALL_CLIENTS[i];
    const s = spinner({ frames: SPINNER_FRAMES, delay: SPINNER_DELAY });
    s.start(`[${i + 1}/${total}] Checking ${client.label}…`);
    // await yields the event loop while the CLI probe runs, so the spinner
    // actually animates instead of freezing (the whole point of going async).
    const state = await probe(client);
    if (state === null) {
      s.stop(`—  ${client.label}: not installed`);
      continue;
    }
    rows.push({ client, state });
    s.stop(`${symbol(state)}  ${client.label}: ${summary(state)}`);
  }

  if (rows.length === 0) {
    note(
      'No supported MCP CLI detected (Claude Code, Codex CLI, Gemini CLI).\nInstall one of them first.',
      'No clients found'
    );
    outro('No changes made.');
    return;
  }

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
      hint: r.state.kind === 'in-sync' ? 'in-sync (uncheck to skip)' : undefined,
    }));

  const selected = check(
    await multiselect({
      message: 'Apply to (space to toggle, enter to confirm)',
      options,
      initialValues: options.map((o) => o.value),
      required: false,
    })
  );

  const selectedIds = new Set(selected);

  // 7. APPLY — (re)write every selected client. env is masked (adapters return
  // env: {}), so we cannot tell whether the entered credentials differ from
  // what's stored; skipping "in-sync" clients would silently drop credential
  // updates such as API-key rotation. Existing entries (in-sync or stale) pass
  // replace so `mcp add` doesn't fail on "already exists".
  let applied = 0;
  const failures: Array<{ client: McpClient; error: unknown }> = [];

  for (const { client, state } of finalRows) {
    if (!selectedIds.has(client.id)) continue;
    const exists = state.kind === 'in-sync' || state.kind === 'stale';
    try {
      await write(client, canonical, SERVER_NAME, { replace: exists });
      applied++;
    } catch (e) {
      failures.push({ client, error: e });
    }
  }

  // 8. REPORT
  const reportLines: string[] = [];
  if (applied > 0) reportLines.push(`✓  Applied to ${applied} client(s)`);
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
  // Every selected client that was successfully (re)written needs a restart —
  // including in-sync ones, which are now re-applied for credential rotation.
  // Exclude only clients whose write() failed (not actually updated).
  const failedIds = new Set(failures.map((f) => f.client.id));
  const restartClients = finalRows
    .filter((r) => selectedIds.has(r.client.id) && !failedIds.has(r.client.id))
    .map((r) => r.client.label);

  if (restartClients.length > 0) {
    outro(`Restart ${restartClients.join(', ')} to activate the MCP server.`);
  } else {
    outro('Done.');
  }
}
