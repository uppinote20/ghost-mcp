/**
 * Registry of all MCP client adapters.
 *
 * @handbook 2.5-client-adapters
 */
import { claudeCode } from './claude-code.js';
import { codex } from './codex.js';
import { gemini } from './gemini.js';

export const ALL_CLIENTS = [claudeCode, codex, gemini];
