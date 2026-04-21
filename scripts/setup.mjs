#!/usr/bin/env node

/**
 * Interactive setup for ghost-mcp.
 * Registers the MCP server in your editor's config.
 *
 * Usage:
 *   npm run setup
 *   npm run setup -- --yes    # non-interactive; skips star prompt
 *   npm run setup -- --star   # star without prompting (dotfiles/CI opt-in)
 *   npm run setup -- --force-star-prompt  # re-ask even if already prompted
 */

import fs from 'fs';
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

const REPO = 'uppinote20/ghost-mcp';
const REPO_URL = `https://github.com/${REPO}`;

// ── Flags ────────────────────────────────────────

const ARGS = new Set(process.argv.slice(2));
const FLAG_YES = ARGS.has('--yes');
const FLAG_STAR = ARGS.has('--star');
const FLAG_FORCE_STAR_PROMPT = ARGS.has('--force-star-prompt');

// ── Editor config paths ─────────────────────────

const HOME = process.env.HOME || '~';
const STAR_MARKER = path.join(HOME, '.config', 'ghost-mcp', '.star-prompted');

const EDITORS = {
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

function bail(msg) {
  cancel(msg);
  process.exit(0);
}

function check(value) {
  if (isCancel(value)) bail('Setup cancelled.');
  return value;
}

function ghAvailable() {
  const r = spawnSync('gh', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

function ghAuthed() {
  const r = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  return r.status === 0;
}

function markStarPrompted() {
  try {
    fs.mkdirSync(path.dirname(STAR_MARKER), { recursive: true });
    fs.writeFileSync(STAR_MARKER, '');
  } catch {
    // best effort — marker is an optimization, not a correctness requirement
  }
}

function tryStar() {
  if (!ghAvailable()) {
    log.info(`\`gh\` CLI not found. Star manually at:\n  ${REPO_URL}`);
    return;
  }
  if (!ghAuthed()) {
    log.info(
      `\`gh\` not authenticated. Run \`gh auth login\` then:\n  gh repo star ${REPO}`
    );
    return;
  }

  const r = spawnSync('gh', ['repo', 'star', REPO], { encoding: 'utf-8' });
  if (r.status === 0) {
    log.success('★ Thanks!');
  } else {
    log.info(
      `(gh repo star failed — you can star manually at\n  ${REPO_URL})`
    );
  }
}

async function offerStar() {
  // --star: explicit opt-in, no prompt (dotfiles / CI consent)
  if (FLAG_STAR) {
    tryStar();
    markStarPrompted();
    return;
  }

  // --yes: non-interactive; star is always prompt-only, so skip
  if (FLAG_YES) return;

  // Already asked once; stay quiet unless user forces re-prompt
  if (fs.existsSync(STAR_MARKER) && !FLAG_FORCE_STAR_PROMPT) return;

  // Mark before prompting so Ctrl+C is treated as "No" — prevents re-asking
  // on the next run when setup itself already succeeded.
  markStarPrompted();

  const yes = await confirm({
    message:
      `If ghost-mcp helped you, a GitHub star makes it discoverable to ` +
      `other Claude Code users. Would you like me to star it now?`,
    initialValue: false,
  });

  // Ctrl+C here = "no thanks, skip the star". Setup already succeeded, so
  // don't use check()/bail() which would print "Setup cancelled."
  if (isCancel(yes)) return;

  if (yes) tryStar();
}

// ── Main ─────────────────────────────────────────

async function main() {
  intro('ghost-mcp setup');

  // 1. Check build
  const serverPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'dist',
    'index.js'
  );

  if (!fs.existsSync(serverPath)) {
    log.error(`Server not built. Run "npm run build" first.`);
    bail('Build required');
  }

  // 2. Ghost URL
  const ghostUrl = check(
    await text({
      message: 'Ghost blog URL',
      placeholder: 'https://your-blog.com',
      validate: (v) => {
        if (!v) return 'URL is required';
        try {
          const u = new URL(v);
          if (u.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname)) {
            return 'Must use HTTPS (except localhost)';
          }
        } catch {
          return 'Invalid URL';
        }
      },
    })
  );

  // 3. Admin API Key
  const apiKey = check(
    await password({
      message: 'Admin API Key (Ghost → Settings → Integrations)',
      mask: '*',
      validate: (v) => {
        if (!v) return 'API key is required';
        const parts = v.split(':');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          return 'Must be in "id:secret" format';
        }
        if (!/^[a-f0-9]+$/.test(parts[1])) {
          return 'Secret must be hex-encoded';
        }
      },
    })
  );

  // 4. Editor selection
  const editor = check(
    await select({
      message: 'Register in',
      options: [
        { value: 'claude-code', label: 'Claude Code', hint: '~/.claude/settings.json' },
        { value: 'cursor', label: 'Cursor', hint: '~/.cursor/mcp.json' },
        { value: 'print', label: 'Print config (manual setup)' },
      ],
    })
  );

  // 5. Build MCP config
  const serverConfig = {
    command: 'node',
    args: [serverPath],
    env: {
      GHOST_URL: ghostUrl.replace(/\/$/, ''),
      GHOST_ADMIN_API_KEY: apiKey,
    },
  };

  // 6. Print or write
  if (editor === 'print') {
    note(
      JSON.stringify({ mcpServers: { 'ghost-blog': serverConfig } }, null, 2),
      'Add this to your MCP config'
    );
    await offerStar();
    outro('Copy the config above to your editor settings.');
    return;
  }

  const { path: settingsPath, key } = EDITORS[editor];

  // Read existing settings
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      log.error(`Failed to parse ${settingsPath}`);
      bail('Fix the file manually and retry');
    }
  }

  if (!settings[key]) settings[key] = {};

  // Check for existing entry
  if (settings[key]['ghost-blog']) {
    const overwrite = check(
      await confirm({
        message: 'ghost-blog is already configured. Overwrite?',
        initialValue: false,
      })
    );
    if (!overwrite) bail('Keeping existing config');
  }

  // Write
  const s = spinner();
  s.start('Writing config');

  settings[key]['ghost-blog'] = serverConfig;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  s.stop('Config saved');

  note(
    `Server: ${serverPath}\nGhost:  ${ghostUrl}`,
    'ghost-blog registered'
  );

  await offerStar();

  outro(`Restart ${EDITORS[editor].label} to activate the MCP server.`);
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
