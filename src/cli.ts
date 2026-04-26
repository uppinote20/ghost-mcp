#!/usr/bin/env node
/**
 * ghost-mcp CLI entry.
 *
 * Modes:
 *   ghost-mcp           → start MCP server over stdio (default — invoked by editors)
 *   ghost-mcp setup     → interactive setup wizard (one-time, registers in editor config)
 *
 * @handbook 2.1-mcp-bootstrap
 * @tested src/cli.test.ts
 */
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

export async function main(argv: string[] = process.argv): Promise<void> {
  const sub = argv[2];

  if (sub === 'setup') {
    const { runSetup } = await import('./setup.js');
    await runSetup();
  } else if (sub !== undefined) {
    process.stderr.write(`Unknown subcommand: ${sub}. Usage: ghost-mcp [setup]\n`);
    process.exit(1);
  } else {
    // Parallel dynamic imports — server-mode hot path on every editor restart.
    const [
      { StdioServerTransport },
      { loadConfig },
      { createServer },
    ] = await Promise.all([
      import('@modelcontextprotocol/sdk/server/stdio.js'),
      import('./config.js'),
      import('./server.js'),
    ]);

    const config = loadConfig();
    const server = createServer(config);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

// Detect "invoked as main module" — survives npm/npx symlinks and Windows
// drive-letter URLs by canonicalising both sides through realpath +
// fileURLToPath. Plain string comparison of import.meta.url against
// `file://${process.argv[1]}` would break in those cases.
function isMainModule(): boolean {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  await main();
}
