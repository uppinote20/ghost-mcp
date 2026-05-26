/**
 * Thin wrapper around Node's spawnSync for testability.
 *
 * Tests stub this module via vi.spyOn(proc, 'run') to unit-test dispatch logic
 * without launching real processes.
 *
 * @handbook 2.4-setup-wizard
 */
import { spawnSync, SpawnSyncOptions } from 'node:child_process';

export type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

/**
 * Run a command synchronously and capture its output.
 *
 * @param cli Command to run (e.g., "node", "gh")
 * @param args Command arguments
 * @param options Optional spawnSync options; defaults to UTF-8 encoding
 * @returns Object with status, stdout, stderr, and optional error
 */
export function run(
  cli: string,
  args: string[],
  options?: SpawnSyncOptions
): RunResult {
  const mergedOptions: SpawnSyncOptions = {
    encoding: 'utf-8',
    ...options,
  };

  try {
    const result = spawnSync(cli, args, mergedOptions);

    // spawnSync sets error when the command could not be spawned
    if (result.error) {
      return {
        status: null,
        stdout: '',
        stderr: '',
        error: result.error,
      };
    }

    return {
      status: result.status ?? 0,
      stdout: typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString() ?? '',
      stderr: typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString() ?? '',
    };
  } catch (err) {
    // Defensive: shouldn't reach here with spawnSync, but handle just in case
    return {
      status: null,
      stdout: '',
      stderr: '',
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}
