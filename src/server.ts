import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GhostAdminApi } from './ghost/client.js';
import { IndexManager } from './sync/index-manager.js';
import { registerPostTools } from './tools/post-tools.js';
import { registerTagTools } from './tools/tag-tools.js';
import { registerPageTools } from './tools/page-tools.js';
import { registerSyncTools } from './tools/sync-tools.js';
import type { Config } from './config.js';

export function createServer(config: Config): McpServer {
  const server = new McpServer({
    name: 'ghost-blog',
    version: '1.0.0',
  });

  const ghost = new GhostAdminApi(config.ghostUrl, config.ghostAdminApiKey);
  const indexManager = new IndexManager();

  registerPostTools(server, ghost);
  registerTagTools(server, ghost);
  registerPageTools(server, ghost);
  registerSyncTools(server, ghost, indexManager);

  return server;
}
