/** @covers src/cli.ts */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { main } from './cli.js';

describe('cli main()', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: number | string | null | undefined) => {
        throw new Error(`__exit__:${code}`);
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits 1 with stderr message on unknown subcommand', async () => {
    await expect(main(['node', 'cli.js', 'bogus'])).rejects.toThrow('__exit__:1');
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown subcommand: bogus')
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('formats subcommand name in stderr message', async () => {
    await expect(main(['node', 'cli.js', 'foo bar'])).rejects.toThrow();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown subcommand: foo bar')
    );
  });

  it('mentions allowed subcommand "setup" in stderr usage hint', async () => {
    await expect(main(['node', 'cli.js', 'typo'])).rejects.toThrow();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('ghost-mcp [setup]')
    );
  });
});
