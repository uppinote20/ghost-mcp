/**
 * Interactive setup for ghost-mcp.
 * Registers the MCP server in your editor's config using `npx -y` invocation
 * so the editor always picks up the latest published version.
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
  select,
  confirm,
  note,
  cancel,
  isCancel,
  spinner,
  log,
} from '@clack/prompts';
import { checkGhostUrl, checkGhostKey } from './validation.js';

const REPO = 'uppinote20/ghost-mcp';
const REPO_URL = `https://github.com/${REPO}`;
const NPM_PACKAGE = '@uppinote/ghost-mcp';

// ── Editor config paths ─────────────────────────

const HOME = os.homedir();
const STAR_MARKER = path.join(HOME, '.config', 'ghost-mcp', '.star-prompted');

const EDITORS: Record<
  string,
  { label: string; path: string | null; key: string }
> = {
  'claude-code': {
    label: 'Claude Code',
    path: path.join(HOME, '.claude', 'settings.json'),
    key: 'mcpServers',
  },
  cursor: {
    label: 'Cursor',
    path: path.join(HOME, '.cursor', 'mcp.json'),
    key: 'mcpServers',
  },
  print: {
    label: 'Print config (manual setup)',
    path: null,
    key: 'mcpServers',
  },
};

// ── Helpers ──────────────────────────────────────

function bail(msg: string): never {
  cancel(msg);
  process.exit(0);
}

function bailError(msg: string): never {
  cancel(msg);
  process.exit(1);
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

  intro('ghost-mcp setup');

  // 1. Ghost URL
  const ghostUrl = check(
    await text({
      message: 'Ghost blog URL',
      placeholder: 'https://your-blog.com',
      validate: checkGhostUrl,
    })
  );

  // 2. Admin API Key
  const apiKey = check(
    await password({
      message: 'Admin API Key (Ghost → Settings → Integrations)',
      mask: '*',
      validate: checkGhostKey,
    })
  );

  // 3. Editor selection
  const editor = check(
    await select({
      message: 'Register in',
      options: [
        { value: 'claude-code', label: 'Claude Code', hint: '~/.claude/settings.json' },
        { value: 'cursor', label: 'Cursor', hint: '~/.cursor/mcp.json' },
        { value: 'print', label: 'Print config (manual setup)' },
      ],
    })
  ) as string;

  // 4. Build MCP config — uses `npx -y` so the editor always pulls the latest
  //    published version on next start (npm cache TTL is ~24h).
  const serverConfig = {
    command: 'npx',
    args: ['-y', `${NPM_PACKAGE}@latest`],
    env: {
      GHOST_URL: ghostUrl.replace(/\/$/, ''),
      GHOST_ADMIN_API_KEY: apiKey,
    },
  };

  // 5. Print or write
  if (editor === 'print') {
    note(
      JSON.stringify({ mcpServers: { 'ghost-blog': serverConfig } }, null, 2),
      'Add this to your MCP config'
    );
    await offerStar({ yes: flagYes, star: flagStar, forceStarPrompt: flagForceStarPrompt });
    outro('Copy the config above to your editor settings.');
    return;
  }

  const { path: settingsPath, key } = EDITORS[editor];
  if (!settingsPath) bailError('Internal: editor has no settings path');

  // Read existing settings
  let settings: Record<string, Record<string, unknown>> = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      log.error(`Failed to parse ${settingsPath}`);
      bailError('Fix the file manually and retry');
    }
  }

  if (!settings[key]) settings[key] = {};

  if (settings[key]['ghost-blog']) {
    const overwrite = check(
      await confirm({
        message: 'ghost-blog is already configured. Overwrite?',
        initialValue: false,
      })
    );
    if (!overwrite) bail('Keeping existing config');
  }

  const s = spinner();
  s.start('Writing config');

  settings[key]['ghost-blog'] = serverConfig;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  s.stop('Config saved');

  note(
    `Package: ${NPM_PACKAGE}@latest (auto-updated by npx)\nGhost:   ${ghostUrl}`,
    'ghost-blog registered'
  );

  await offerStar({ yes: flagYes, star: flagStar, forceStarPrompt: flagForceStarPrompt });

  outro(`Restart ${EDITORS[editor].label} to activate the MCP server.`);
}
