/**
 * Shared reader for adapters that read MCP registration from a JSON config file
 * instead of the CLI — used when `mcp list` is unusable for a captured read.
 * gemini's list is TTY-gated (empty when piped); claude's list reports the
 * *effective* scope rather than the user scope the wizard writes to. env is left
 * empty to match classify's env-skip convention (drift is detected on
 * command/args).
 *
 * @handbook 2.5-client-adapters
 * @tested src/setup/clients/json-config.test.ts
 */
import fs from 'node:fs';
import { RegisteredEntry } from '../types.js';

export function readFromJsonConfig(file: string, name: string): RegisteredEntry | null {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      mcpServers?: Record<string, { command?: unknown; args?: unknown }>;
    };
    const entry = json.mcpServers?.[name];
    if (!entry || typeof entry.command !== 'string') return null;
    return {
      command: entry.command,
      args: Array.isArray(entry.args) ? entry.args.map(String) : [],
      env: {},
    };
  } catch {
    // missing file / malformed JSON / no such server → treat as not registered
    return null;
  }
}
