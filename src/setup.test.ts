/** @covers src/setup.ts */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import * as proc from './setup/process.js';

// Mock @clack/prompts to feed deterministic answers
vi.mock('@clack/prompts', async () => {
  const actual = await vi.importActual<typeof import('@clack/prompts')>('@clack/prompts');
  return {
    ...actual,
    intro: vi.fn(),
    outro: vi.fn(),
    note: vi.fn(),
    log: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
    spinner: () => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() }),
    text: vi.fn().mockResolvedValue('https://blog.example.com'),
    password: vi.fn().mockResolvedValue('id-1234567890abcdef:secret-key-32-chars-here-aaa-bbb'),
    multiselect: vi.fn(),
    confirm: vi.fn().mockResolvedValue(false),
    isCancel: vi.fn().mockReturnValue(false),
    cancel: vi.fn(),
  };
});

beforeEach(() => {
  vi.restoreAllMocks();
});

// claude's readEntry reads ~/.claude.json via fs.readFileSync — stub it so the
// wizard sees a specific user-scope registration (or none).
function stubClaudeConfig(entry: { command: string; args: string[] } | null): void {
  vi.spyOn(fs, 'readFileSync').mockReturnValue(
    JSON.stringify(entry ? { mcpServers: { 'ghost-blog': entry } } : { mcpServers: {} })
  );
}

// Only Claude Code is "installed"; codex/gemini --version fail. Non-version
// calls (mcp add/remove) succeed.
function onlyClaudeInstalled() {
  return vi.spyOn(proc, 'run').mockImplementation(async (cli: string, args: string[]) => {
    if (args[0] === '--version') {
      return cli === 'claude'
        ? { status: 0, stdout: '1', stderr: '' }
        : { status: 127, stdout: '', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  });
}

describe('setup wizard — discover → apply', () => {
  it('exits cleanly when no MCP CLI is detected', async () => {
    vi.spyOn(proc, 'run').mockResolvedValue({ status: 127, stdout: '', stderr: 'not found' });
    const { runSetup } = await import('./setup.js');
    await expect(runSetup()).resolves.not.toThrow();
  });

  it('writes to a detected client that is missing the server', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.multiselect as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['claude-code']);

    stubClaudeConfig(null); // ~/.claude.json has no ghost-blog → missing
    const spy = onlyClaudeInstalled();

    const { runSetup } = await import('./setup.js');
    await runSetup();

    const addCall = spy.mock.calls.find(([c, a]) => c === 'claude' && a[0] === 'mcp' && a[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![1]).toContain('-s');
    expect(addCall![1]).toContain('user');
  });

  it('re-applies a selected in-sync client so credential changes (key rotation) take effect', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.multiselect as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['claude-code']);

    // command/args already match canonical → in-sync, but env is masked so a
    // rotated key is invisible. Keeping it selected must still rewrite it.
    stubClaudeConfig({ command: 'npx', args: ['-y', '@uppinote/ghost-mcp@latest'] });
    const spy = onlyClaudeInstalled();

    const { runSetup } = await import('./setup.js');
    await runSetup();

    const claudeCalls = spy.mock.calls.filter(([c]) => c === 'claude').map(([, a]) => a);
    const removeIdx = claudeCalls.findIndex((a) => a[0] === 'mcp' && a[1] === 'remove');
    const addIdx = claudeCalls.findIndex((a) => a[0] === 'mcp' && a[1] === 'add');
    expect(addIdx).toBeGreaterThanOrEqual(0); // re-added → credentials refreshed
    expect(removeIdx).toBeLessThan(addIdx); // replace: remove before add
  });

  it('removes then adds for a stale client (the node → npx migration)', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.multiselect as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['claude-code']);

    // user-scope entry is an old dev-clone node command → stale vs canonical npx
    stubClaudeConfig({ command: 'node', args: ['/path/dist/index.js'] });
    const spy = onlyClaudeInstalled();

    const { runSetup } = await import('./setup.js');
    await runSetup();

    const claudeCalls = spy.mock.calls.filter(([c]) => c === 'claude').map(([, a]) => a);
    const removeIdx = claudeCalls.findIndex((a) => a[0] === 'mcp' && a[1] === 'remove');
    const addIdx = claudeCalls.findIndex((a) => a[0] === 'mcp' && a[1] === 'add');
    expect(removeIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeGreaterThanOrEqual(0);
    expect(removeIdx).toBeLessThan(addIdx); // remove happens before add
  });

  it('reports failure and omits the failed client from the restart list', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.multiselect as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['claude-code']);

    stubClaudeConfig(null); // missing → wizard attempts write
    // claude installed, but `mcp add` fails (e.g. permission denied)
    vi.spyOn(proc, 'run').mockImplementation(async (cli: string, args: string[]) => {
      if (args[0] === '--version') {
        return cli === 'claude'
          ? { status: 0, stdout: '1', stderr: '' }
          : { status: 127, stdout: '', stderr: '' };
      }
      if (args[0] === 'mcp' && args[1] === 'add') {
        return { status: 1, stdout: '', stderr: 'permission denied' };
      }
      return { status: 0, stdout: '', stderr: '' };
    });

    const { runSetup } = await import('./setup.js');
    await expect(runSetup()).resolves.not.toThrow();

    const { outro } = await import('@clack/prompts');
    const outroArg = (outro as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] ?? '';
    // failed client must not be told to restart
    expect(outroArg).not.toMatch(/Claude Code/);
  });
});
