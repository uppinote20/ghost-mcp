#!/usr/bin/env node

/**
 * Interactive setup for ghost-mcp.
 * Registers the MCP server in your editor's config.
 *
 * Usage:
 *   npm run setup
 */

import fs from 'fs';
import path from 'path';
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

// ── Editor config paths ─────────────────────────

const HOME = process.env.HOME || '~';

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

  outro(`Restart ${EDITORS[editor].label} to activate the MCP server.`);
}

main().catch((err) => {
  log.error(err.message);
  process.exit(1);
});
