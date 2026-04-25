/**
 * @tested src/sync/index-manager.test.ts
 * @handbook 7.2-sync-index
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface SyncEntry {
  ghostId: string;
  ghostSlug: string;
  ghostStatus: string;
  ghostUpdatedAt: string;
  localHash: string;
  lastPushed: string;
}

export interface SyncIndex {
  version: number;
  entries: Record<string, SyncEntry>;
}

const SYNC_DIR = path.join(
  process.env.HOME || '~',
  'blog-drafts'
);
const SYNC_FILE = path.join(SYNC_DIR, '.ghost-sync.json');

export class IndexManager {
  private index: SyncIndex | null = null;

  private async ensureDir(): Promise<void> {
    await fs.mkdir(SYNC_DIR, { recursive: true });
  }

  async load(): Promise<SyncIndex> {
    if (this.index) return this.index;

    await this.ensureDir();

    try {
      const data = await fs.readFile(SYNC_FILE, 'utf-8');
      this.index = JSON.parse(data) as SyncIndex;
    } catch {
      this.index = { version: 1, entries: {} };
    }

    return this.index;
  }

  async save(): Promise<void> {
    await this.ensureDir();
    const index = await this.load();
    await fs.writeFile(SYNC_FILE, JSON.stringify(index, null, 2));
  }

  async getEntry(filename: string): Promise<SyncEntry | undefined> {
    const index = await this.load();
    return index.entries[filename];
  }

  async setEntry(filename: string, entry: SyncEntry): Promise<void> {
    const index = await this.load();
    index.entries[filename] = entry;
    await this.save();
  }

  async getAllEntries(): Promise<Record<string, SyncEntry>> {
    const index = await this.load();
    return index.entries;
  }

  async getLocalFiles(): Promise<
    { filename: string; hash: string; fullPath: string }[]
  > {
    await this.ensureDir();
    return this.scanDir(SYNC_DIR, SYNC_DIR);
  }

  private async scanDir(
    dir: string,
    baseDir: string
  ): Promise<{ filename: string; hash: string; fullPath: string }[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results: { filename: string; hash: string; fullPath: string }[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        continue; // Skip symlinks to prevent directory traversal
      }

      if (entry.isDirectory()) {
        results.push(...(await this.scanDir(fullPath, baseDir)));
      } else if (entry.name.endsWith('.md')) {
        const relativePath = path.relative(baseDir, fullPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        results.push({
          filename: relativePath,
          hash: computeHash(content),
          fullPath,
        });
      }
    }

    return results;
  }
}

export function computeHash(content: string): string {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}
