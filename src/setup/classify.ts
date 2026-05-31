/**
 * State classification + canonical value resolution.
 *
 * classify(canonical, entry) → in-sync | stale (with diff reasons) | missing
 * resolveCanonical(envs) → unique GhostEnv | 'conflict' | null
 *
 * env comparison is conditional: if the adapter returned env={} (Claude Code,
 * Codex, Gemini all mask env), we skip env comparison entirely — drift falls
 * back to command/args, which IS extractable from CLI output. The wizard
 * always writes fresh env values regardless of drift state, so this conservative
 * env handling is safe.
 *
 * @handbook 2.5-client-adapters
 * @tested src/setup/classify.test.ts
 */
import { ClientState, GhostEnv, RegisteredEntry } from './types.js';
import { CANONICAL_CMD, CANONICAL_ARGS } from './dispatch.js';

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function classify(
  canonical: GhostEnv,
  entry: RegisteredEntry | null
): ClientState {
  if (entry === null) return { kind: 'missing' };

  const reasons: string[] = [];

  if (entry.command !== CANONICAL_CMD) {
    reasons.push(`command is "${entry.command}" (expected "${CANONICAL_CMD}")`);
  }
  if (!arraysEqual(entry.args, CANONICAL_ARGS)) {
    reasons.push(
      `args are [${entry.args.join(', ')}] (expected [${CANONICAL_ARGS.join(', ')}])`
    );
  }
  if (
    entry.env.GHOST_URL !== undefined &&
    entry.env.GHOST_URL !== canonical.GHOST_URL
  ) {
    reasons.push(
      `env.GHOST_URL is "${entry.env.GHOST_URL}" (expected "${canonical.GHOST_URL}")`
    );
  }
  if (
    entry.env.GHOST_ADMIN_API_KEY !== undefined &&
    entry.env.GHOST_ADMIN_API_KEY !== canonical.GHOST_ADMIN_API_KEY
  ) {
    reasons.push('env.GHOST_ADMIN_API_KEY differs from canonical');
  }

  return reasons.length === 0
    ? { kind: 'in-sync', entry }
    : { kind: 'stale', entry, reasons };
}

export type CanonicalResult = GhostEnv | 'conflict' | null;

export function resolveCanonical(envs: GhostEnv[]): CanonicalResult {
  if (envs.length === 0) return null;
  const first = envs[0];
  const allAgree = envs.every(
    (e) =>
      e.GHOST_URL === first.GHOST_URL &&
      e.GHOST_ADMIN_API_KEY === first.GHOST_ADMIN_API_KEY
  );
  return allAgree ? first : 'conflict';
}
