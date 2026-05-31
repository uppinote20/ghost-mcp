/** @covers src/setup/process.ts */
import { describe, it, expect } from 'vitest';
import { run } from './process.js';

describe('process.run', () => {
  it('successful command returns status 0 and captures stdout', async () => {
    const result = await run('node', ['-e', 'process.stdout.write("hello")']);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('failing command returns non-zero status and captures stderr', async () => {
    const result = await run('node', ['-e', 'process.stderr.write("oops"); process.exit(2)']);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe('oops');
    expect(result.error).toBeUndefined();
  });

  it('missing binary returns status null with error property defined', async () => {
    const result = await run('this-binary-does-not-exist-xyz', ['--version']);
    expect(result.status).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error).toBeInstanceOf(Error);
  });
});
