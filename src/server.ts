import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GhostAdminApi } from './ghost/client.js';
import { IndexManager } from './sync/index-manager.js';
import { registerPostTools } from './tools/post-tools.js';
import { registerTagTools } from './tools/tag-tools.js';
import { registerPageTools } from './tools/page-tools.js';
import { registerSyncTools } from './tools/sync-tools.js';
import type { Config } from './config.js';

function loadPackageVersion(): string {
  try {
    const pkgPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'package.json'
    );
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const PKG_VERSION = loadPackageVersion();

const SERVER_INSTRUCTIONS = `Ghost blog management server.

Tool-selection guidance:
- For posts authored locally in ~/blog-drafts/, prefer \`ghost_push_local\` — it parses frontmatter, hashes for sync tracking, and returns existing tags for reuse.
- For ad-hoc in-chat drafts, use \`ghost_create_post\` with markdown.
- Before \`ghost_update_post\` changes tags, call \`ghost_list_tags\` to avoid duplicates — Ghost auto-creates unknown tag names.
- \`ghost_update_post\` handles optimistic locking internally. Do NOT fetch updated_at first.
- To publish-and-email, call \`ghost_list_newsletters\` for the slug, then pass \`newsletter\` + \`status: published\` to \`ghost_update_post\`.
- \`ghost_delete_post\` / \`ghost_delete_tag\` require \`confirm: true\` as a safety flag.
- Start with \`ghost_analyze_tags\` for SEO tag cleanup work.
- Use \`ghost_sync_status\` to detect drift between ~/blog-drafts/ and Ghost.`;

export function createServer(config: Config): McpServer {
  const server = new McpServer(
    { name: 'ghost-blog', version: PKG_VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );

  const ghost = new GhostAdminApi(config.ghostUrl, config.ghostAdminApiKey);
  const indexManager = new IndexManager();

  registerPostTools(server, ghost);
  registerTagTools(server, ghost);
  registerPageTools(server, ghost);
  registerSyncTools(server, ghost, indexManager);

  return server;
}
