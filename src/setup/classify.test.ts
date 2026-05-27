/** @covers src/setup/classify.ts */
import { describe, it, expect } from 'vitest';
import { classify, resolveCanonical } from './classify.js';
import { GhostEnv, RegisteredEntry } from './types.js';

describe('classify', () => {
  const canonical: GhostEnv = {
    GHOST_URL: 'https://blog.example.com',
    GHOST_ADMIN_API_KEY: 'key:secret123',
  };

  it('returns in-sync when command/args/env all match canonical', () => {
    const entry: RegisteredEntry = {
      command: 'npx',
      args: ['-y', '@uppinote/ghost-mcp@latest'],
      env: {
        GHOST_URL: 'https://blog.example.com',
        GHOST_ADMIN_API_KEY: 'key:secret123',
      },
    };

    const state = classify(canonical, entry);
    expect(state.kind).toBe('in-sync');
    if (state.kind === 'in-sync') {
      expect(state.entry).toBe(entry);
    }
  });

  it('returns stale when GHOST_URL differs', () => {
    const entry: RegisteredEntry = {
      command: 'npx',
      args: ['-y', '@uppinote/ghost-mcp@latest'],
      env: {
        GHOST_URL: 'https://old-blog.example.com',
        GHOST_ADMIN_API_KEY: 'key:secret123',
      },
    };

    const state = classify(canonical, entry);
    expect(state.kind).toBe('stale');
    if (state.kind === 'stale') {
      expect(state.reasons.join(' ')).toMatch(/GHOST_URL/);
      expect(state.reasons.join(' ')).toMatch(/old-blog\.example\.com/);
    }
  });

  it('returns stale when GHOST_ADMIN_API_KEY differs', () => {
    const entry: RegisteredEntry = {
      command: 'npx',
      args: ['-y', '@uppinote/ghost-mcp@latest'],
      env: {
        GHOST_URL: 'https://blog.example.com',
        GHOST_ADMIN_API_KEY: 'key:oldSecret',
      },
    };

    const state = classify(canonical, entry);
    expect(state.kind).toBe('stale');
    if (state.kind === 'stale') {
      expect(state.reasons.join(' ')).toMatch(/GHOST_ADMIN_API_KEY/);
    }
  });

  it('returns stale when command differs (dev-clone: command=node)', () => {
    const entry: RegisteredEntry = {
      command: 'node',
      args: ['/path/dist/index.js'],
      env: {
        GHOST_URL: 'https://blog.example.com',
        GHOST_ADMIN_API_KEY: 'key:secret123',
      },
    };

    const state = classify(canonical, entry);
    expect(state.kind).toBe('stale');
    if (state.kind === 'stale') {
      expect(state.reasons.join(' ')).toMatch(/command/);
      expect(state.reasons.join(' ')).toMatch(/node/);
    }
  });

  it('returns stale when args differ (pinned version)', () => {
    const entry: RegisteredEntry = {
      command: 'npx',
      args: ['-y', '@uppinote/ghost-mcp@1.1.0'],
      env: {
        GHOST_URL: 'https://blog.example.com',
        GHOST_ADMIN_API_KEY: 'key:secret123',
      },
    };

    const state = classify(canonical, entry);
    expect(state.kind).toBe('stale');
    if (state.kind === 'stale') {
      expect(state.reasons.join(' ')).toMatch(/args/);
      expect(state.reasons.join(' ')).toMatch(/1\.1\.0/);
    }
  });

  it('returns missing when entry is null', () => {
    const state = classify(canonical, null);
    expect(state.kind).toBe('missing');
  });

  it('returns in-sync when entry.env is empty {} and command/args match (design pivot case)', () => {
    const entry: RegisteredEntry = {
      command: 'npx',
      args: ['-y', '@uppinote/ghost-mcp@latest'],
      env: {},
    };

    const state = classify(canonical, entry);
    expect(state.kind).toBe('in-sync');
    if (state.kind === 'in-sync') {
      expect(state.entry).toBe(entry);
    }
  });

  it('accumulates multiple diff reasons when multiple fields differ', () => {
    const entry: RegisteredEntry = {
      command: 'node',
      args: ['/path/dist/index.js'],
      env: {
        GHOST_URL: 'https://old-blog.example.com',
        GHOST_ADMIN_API_KEY: 'key:oldSecret',
      },
    };

    const state = classify(canonical, entry);
    expect(state.kind).toBe('stale');
    if (state.kind === 'stale') {
      expect(state.reasons.length).toBeGreaterThan(1);
      const combined = state.reasons.join(' ');
      expect(combined).toMatch(/command/);
      expect(combined).toMatch(/args/);
      expect(combined).toMatch(/GHOST_URL/);
      expect(combined).toMatch(/GHOST_ADMIN_API_KEY/);
    }
  });
});

describe('resolveCanonical', () => {
  it('returns null on empty input', () => {
    const result = resolveCanonical([]);
    expect(result).toBeNull();
  });

  it('returns the unique value when all entries agree', () => {
    const env1: GhostEnv = {
      GHOST_URL: 'https://blog.example.com',
      GHOST_ADMIN_API_KEY: 'key:secret123',
    };
    const env2: GhostEnv = {
      GHOST_URL: 'https://blog.example.com',
      GHOST_ADMIN_API_KEY: 'key:secret123',
    };

    const result = resolveCanonical([env1, env2]);
    expect(result).toEqual(env1);
  });

  it('returns "conflict" when entries disagree on GHOST_URL', () => {
    const env1: GhostEnv = {
      GHOST_URL: 'https://blog.example.com',
      GHOST_ADMIN_API_KEY: 'key:secret123',
    };
    const env2: GhostEnv = {
      GHOST_URL: 'https://other-blog.example.com',
      GHOST_ADMIN_API_KEY: 'key:secret123',
    };

    const result = resolveCanonical([env1, env2]);
    expect(result).toBe('conflict');
  });

  it('returns "conflict" when entries disagree on GHOST_ADMIN_API_KEY', () => {
    const env1: GhostEnv = {
      GHOST_URL: 'https://blog.example.com',
      GHOST_ADMIN_API_KEY: 'key:secret123',
    };
    const env2: GhostEnv = {
      GHOST_URL: 'https://blog.example.com',
      GHOST_ADMIN_API_KEY: 'key:otherSecret',
    };

    const result = resolveCanonical([env1, env2]);
    expect(result).toBe('conflict');
  });

  it('returns the single entry when input has only one element', () => {
    const env: GhostEnv = {
      GHOST_URL: 'https://blog.example.com',
      GHOST_ADMIN_API_KEY: 'key:secret123',
    };

    const result = resolveCanonical([env]);
    expect(result).toEqual(env);
  });
});
