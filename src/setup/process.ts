/**
 * Thin async wrapper around Node's child_process.spawn, for testability and to
 * keep the event loop free.
 *
 * Async (not spawnSync) on purpose: the wizard's scan shows a live spinner while
 * each CLI probe runs, and a synchronous spawn would block the event loop and
 * freeze the animation. Tests stub this module via vi.spyOn(proc, 'run') to
 * unit-test dispatch logic without launching real processes.
 *
 * @handbook 2.5-client-adapters
 * @tested src/setup/process.test.ts
 */
import { spawn, SpawnOptions } from 'node:child_process';

export type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
};

/**
 * Run a command and capture its output.
 *
 * @param cli Command to run (e.g., "node", "gh")
 * @param args Command arguments
 * @param options Optional spawn options; default stdio is 'pipe' so stdout/stderr
 *   are captured. With stdio: 'inherit' (writes) nothing is piped, so stdout/stderr
 *   come back empty and only `status` is meaningful.
 * @returns Promise of { status, stdout, stderr, and optional error }
 */
export function run(
  cli: string,
  args: string[],
  options?: SpawnOptions
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cli, args, options ?? {});

    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    // 'error' fires when the command could not be spawned (ENOENT etc.).
    child.on('error', (error) => {
      resolve({ status: null, stdout: '', stderr: '', error });
    });

    // 'close' fires once the process has exited and its stdio is flushed.
    // status is null on signal termination — preserve that, don't coerce to 0.
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
