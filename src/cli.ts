#!/usr/bin/env node
/**
 * ghost-mcp CLI entry.
 *
 * Modes:
 *   ghost-mcp           → start MCP server over stdio (default — invoked by editors)
 *   ghost-mcp setup     → interactive setup wizard (one-time, registers in editor config)
 *
 * @handbook 2.1-mcp-bootstrap
 */
const sub = process.argv[2];

if (sub === 'setup') {
  const { runSetup } = await import('./setup.js');
  await runSetup();
} else if (sub !== undefined) {
  process.stderr.write(`Unknown subcommand: ${sub}. Usage: ghost-mcp [setup]\n`);
  process.exit(1);
} else {
  const { StdioServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/stdio.js'
  );
  const { loadConfig } = await import('./config.js');
  const { createServer } = await import('./server.js');

  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
