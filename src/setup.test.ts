/** @covers src/setup.ts */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    spinner: () => ({ start: vi.fn(), stop: vi.fn() }),
    text: vi.fn().mockResolvedValue('https://blog.example.com'),
    password: vi.fn().mockResolvedValue('id-1234567890abcdef:secret-key-32-chars-here-aaa-bbb'),
    multiselect: vi.fn(),
    confirm: vi.fn().mockResolvedValue(false),
    isCancel: vi.fn().mockReturnValue(false),
    cancel: vi.fn(),
  };
});

beforeEach(() => { vi.restoreAllMocks(); });

describe('setup wizard — discover → apply', () => {
  it('exits cleanly when no MCP CLI is detected', async () => {
    vi.spyOn(proc, 'run').mockReturnValue({ status: 127, stdout: '', stderr: 'not found' });
    const { runSetup } = await import('./setup.js');
    await expect(runSetup()).resolves.not.toThrow();
  });

  it('writes to a detected client that is missing the server', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.multiselect as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['claude-code']);

    const spy = vi.spyOn(proc, 'run').mockImplementation((cli: string, args: string[]) => {
      if (args[0] === '--version') return cli === 'claude' ? { status: 0, stdout: '1', stderr: '' } : { status: 127, stdout: '', stderr: '' };
      if (args[0] === 'mcp' && args[1] === 'list') return { status: 0, stdout: '', stderr: '' };  // empty → parseGet returns null → classify missing
      if (args[0] === 'mcp' && args[1] === 'add') return { status: 0, stdout: '', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    });

    const { runSetup } = await import('./setup.js');
    await runSetup();

    const addCall = spy.mock.calls.find(([c, a]) => c === 'claude' && a[0] === 'mcp' && a[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall![1]).toContain('-s');
    expect(addCall![1]).toContain('user');
  });

  it('skips write for an in-sync client even when the user checks the box', async () => {
    const prompts = await import('@clack/prompts');
    (prompts.multiselect as ReturnType<typeof vi.fn>).mockResolvedValueOnce(['claude-code']);

    // In-sync list output: command+args match canonical npx invocation
    const inSyncList = `ghost-blog: npx -y @uppinote/ghost-mcp@latest - ✓ Connected\n`;

    const spy = vi.spyOn(proc, 'run').mockImplementation((cli: string, args: string[]) => {
      if (args[0] === '--version') return cli === 'claude' ? { status: 0, stdout: '1', stderr: '' } : { status: 127, stdout: '', stderr: '' };
      if (args[0] === 'mcp' && args[1] === 'list') return { status: 0, stdout: inSyncList, stderr: '' };
      if (args[0] === 'mcp' && args[1] === 'add') return { status: 0, stdout: '', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    });

    const { runSetup } = await import('./setup.js');
    await runSetup();

    const addCall = spy.mock.calls.find(([c, a]) => c === 'claude' && a[0] === 'mcp' && a[1] === 'add');
    expect(addCall).toBeUndefined();
  });
});
