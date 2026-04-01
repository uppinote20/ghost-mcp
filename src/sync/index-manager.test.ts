/** @covers src/sync/index-manager.ts */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { IndexManager } from './index-manager.js';

describe('IndexManager.scanDir — symlink handling', () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips symlinks instead of following them', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-test-'));

    // Create a markdown file in the temp dir
    await fs.writeFile(path.join(tmpDir, 'real.md'), '# Real Post');

    // Create a symlink pointing outside the temp dir
    const outsideDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ghost-outside-')
    );
    await fs.writeFile(path.join(outsideDir, 'secret.md'), '# Secret');
    await fs.symlink(outsideDir, path.join(tmpDir, 'escape-link'));

    // Invoke the private scanDir method
    const manager = new IndexManager();
    const results = await (manager as any).scanDir(tmpDir, tmpDir);

    const filenames = results.map(
      (r: { filename: string }) => r.filename
    );

    // Should find the real file
    expect(filenames).toContain('real.md');

    // Should NOT find the file behind the symlink
    expect(filenames).not.toContain(path.join('escape-link', 'secret.md'));

    // Cleanup the outside dir
    await fs.rm(outsideDir, { recursive: true, force: true });
  });

  it('still scans real subdirectories', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-test-'));

    // Create a real subdirectory with a file
    await fs.mkdir(path.join(tmpDir, 'subdir'));
    await fs.writeFile(path.join(tmpDir, 'subdir', 'nested.md'), '# Nested');
    await fs.writeFile(path.join(tmpDir, 'top.md'), '# Top');

    const manager = new IndexManager();
    const results = await (manager as any).scanDir(tmpDir, tmpDir);

    const filenames = results.map(
      (r: { filename: string }) => r.filename
    );

    expect(filenames).toContain('top.md');
    expect(filenames).toContain(path.join('subdir', 'nested.md'));
  });

  it('ignores dotfiles', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-test-'));

    await fs.writeFile(path.join(tmpDir, '.hidden.md'), '# Hidden');
    await fs.writeFile(path.join(tmpDir, 'visible.md'), '# Visible');

    const manager = new IndexManager();
    const results = await (manager as any).scanDir(tmpDir, tmpDir);

    const filenames = results.map(
      (r: { filename: string }) => r.filename
    );

    expect(filenames).not.toContain('.hidden.md');
    expect(filenames).toContain('visible.md');
  });
});
