/**
 * @covers src/tools/post-tools.ts
 * @covers src/tools/tag-tools.ts
 * @covers src/tools/page-tools.ts
 * @covers src/tools/sync-tools.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GhostAdminApi } from '../ghost/client.js';
import { IndexManager } from '../sync/index-manager.js';
import { registerPostTools } from './post-tools.js';
import { registerTagTools } from './tag-tools.js';
import { registerPageTools } from './page-tools.js';
import { registerSyncTools } from './sync-tools.js';

// ── Mock Ghost API ──────────────────────────────

function createMockGhost(overrides: Partial<{
  email: { id: string; status: string; recipient_filter: string | null } | null;
  newsletter: { id: string; name: string; slug: string } | null;
  email_segment: string;
  status: 'draft' | 'published' | 'scheduled' | 'sent';
}> = {}): GhostAdminApi {
  const mockPost = {
    id: '507f1f77bcf86cd799439011',
    uuid: 'test-uuid',
    title: 'Test Post',
    slug: 'test-post',
    status: (overrides.status ?? 'draft') as 'draft' | 'published' | 'scheduled' | 'sent',
    published_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    excerpt: null,
    custom_excerpt: null,
    feature_image: null,
    meta_title: null,
    meta_description: null,
    visibility: 'public' as const,
    tags: [{ id: 'aaa', name: 'test-tag', slug: 'test-tag', description: null }],
    html: '<p>Test</p>',
    plaintext: 'Test',
    mobiledoc: null,
    lexical: '{"root":{"children":[]}}',
    email: overrides.email ?? null,
    newsletter: overrides.newsletter ?? null,
    email_segment: overrides.email_segment ?? 'all',
  };

  const mockTag = {
    id: '607f1f77bcf86cd799439022',
    name: 'Tech',
    slug: 'tech',
    description: 'Technology posts',
    count: { posts: 5 },
  };

  const ghost = {
    getPosts: vi.fn().mockResolvedValue({ posts: [mockPost], pagination: { total: 1, page: 1, limit: 50, pages: 1, next: null, prev: null } }),
    getPost: vi.fn().mockResolvedValue(mockPost),
    getPostBySlug: vi.fn().mockResolvedValue(mockPost),
    createPost: vi.fn().mockResolvedValue(mockPost),
    updatePost: vi.fn().mockResolvedValue(mockPost),
    deletePost: vi.fn().mockResolvedValue(undefined),
    getPages: vi.fn().mockResolvedValue({ pages: [mockPost], pagination: { total: 1, page: 1, limit: 50, pages: 1, next: null, prev: null } }),
    getPage: vi.fn().mockResolvedValue(mockPost),
    getPageBySlug: vi.fn().mockResolvedValue(mockPost),
    updatePage: vi.fn().mockResolvedValue(mockPost),
    getTags: vi.fn().mockResolvedValue({ tags: [mockTag], pagination: undefined }),
    createTag: vi.fn().mockResolvedValue(mockTag),
    deleteTag: vi.fn().mockResolvedValue(undefined),
    getNewsletters: vi.fn().mockResolvedValue([]),
    uploadImage: vi.fn().mockResolvedValue('https://cdn.example.com/image.png'),
  } as unknown as GhostAdminApi;

  return ghost;
}

// ── Test helpers ─────────────────────────────────

async function setupMcpClient(ghost: GhostAdminApi, indexManager?: IndexManager) {
  const server = new McpServer({ name: 'ghost-test', version: '0.0.1' });
  registerPostTools(server, ghost);
  registerTagTools(server, ghost);
  registerPageTools(server, ghost);
  registerSyncTools(server, ghost, indexManager ?? new IndexManager());

  const client = new Client({ name: 'test-client', version: '0.0.1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.server.connect(serverTransport),
  ]);

  return { client, server };
}

// ── Post Tools ───────────────────────────────────

describe('Post Tools (MCP integration)', () => {
  let client: Client;
  let ghost: GhostAdminApi;

  beforeAll(async () => {
    ghost = createMockGhost();
    ({ client } = await setupMcpClient(ghost));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await client.close();
  });

  it('ghost_list_posts returns formatted table', async () => {
    const result = await client.callTool({ name: 'ghost_list_posts', arguments: {} });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Total: 1 posts');
    expect(text).toContain('Test Post');
  });

  it('ghost_list_posts accepts status: sent and forwards it to getPosts', async () => {
    const result = await client.callTool({
      name: 'ghost_list_posts',
      arguments: { status: 'sent' },
    });
    expect(result.isError).toBeFalsy();
    expect(ghost.getPosts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent' })
    );
  });

  it('ghost_get_post accepts valid ID', async () => {
    const result = await client.callTool({
      name: 'ghost_get_post',
      arguments: { id: '507f1f77bcf86cd799439011' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Test Post');
    expect(ghost.getPost).toHaveBeenCalledWith('507f1f77bcf86cd799439011', {
      includeEmail: true,
    });
  });

  it('ghost_get_post rejects invalid ID format', async () => {
    const result = await client.callTool({
      name: 'ghost_get_post',
      arguments: { id: '../admin/settings' },
    });
    expect(result.isError).toBe(true);
  });

  it('ghost_get_post accepts valid slug', async () => {
    const result = await client.callTool({
      name: 'ghost_get_post',
      arguments: { slug: 'my-valid-slug' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Test Post');
  });

  it('ghost_get_post rejects slug with path traversal', async () => {
    const result = await client.callTool({
      name: 'ghost_get_post',
      arguments: { slug: '../../etc/passwd' },
    });
    expect(result.isError).toBe(true);
  });

  it('ghost_get_post returns error when neither id nor slug', async () => {
    const result = await client.callTool({
      name: 'ghost_get_post',
      arguments: {},
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Provide either id or slug');
    expect(result.isError).toBe(true);
  });

  it('ghost_create_post creates draft by default', async () => {
    const result = await client.callTool({
      name: 'ghost_create_post',
      arguments: { title: 'New Post', markdown: '# Hello World' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('created successfully');
    expect(ghost.createPost).toHaveBeenCalled();
  });

  it('ghost_update_post rejects invalid ID', async () => {
    const result = await client.callTool({
      name: 'ghost_update_post',
      arguments: { id: 'INVALID', title: 'Updated' },
    });
    expect(result.isError).toBe(true);
  });

  it('ghost_delete_post requires confirm=true', async () => {
    const result = await client.callTool({
      name: 'ghost_delete_post',
      arguments: { id: '507f1f77bcf86cd799439011', confirm: false },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('cancelled');
    expect(ghost.deletePost).not.toHaveBeenCalled();
  });

  it('ghost_delete_post proceeds with confirm=true', async () => {
    const result = await client.callTool({
      name: 'ghost_delete_post',
      arguments: { id: '507f1f77bcf86cd799439011', confirm: true },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Deleted post');
    expect(ghost.deletePost).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
  });
});

// ── Tag Tools ────────────────────────────────────

describe('Tag Tools (MCP integration)', () => {
  let client: Client;
  let ghost: GhostAdminApi;

  beforeAll(async () => {
    ghost = createMockGhost();
    ({ client } = await setupMcpClient(ghost));
  });

  afterAll(async () => {
    await client.close();
  });

  it('ghost_list_tags returns formatted table', async () => {
    const result = await client.callTool({
      name: 'ghost_list_tags',
      arguments: {},
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Tech');
  });

  it('ghost_create_tag creates a tag', async () => {
    const result = await client.callTool({
      name: 'ghost_create_tag',
      arguments: { name: 'New Tag' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Tag created');
  });

  it('ghost_delete_tag rejects invalid ID format', async () => {
    const result = await client.callTool({
      name: 'ghost_delete_tag',
      arguments: { id: '../traversal', confirm: true },
    });
    expect(result.isError).toBe(true);
  });

  it('ghost_delete_tag rejects slug with path traversal', async () => {
    const result = await client.callTool({
      name: 'ghost_delete_tag',
      arguments: { slug: '../../evil', confirm: true },
    });
    expect(result.isError).toBe(true);
  });
});

// ── Page Tools ───────────────────────────────────

describe('Page Tools (MCP integration)', () => {
  let client: Client;
  let ghost: GhostAdminApi;

  beforeAll(async () => {
    ghost = createMockGhost();
    ({ client } = await setupMcpClient(ghost));
  });

  afterAll(async () => {
    await client.close();
  });

  it('ghost_get_page rejects invalid ID', async () => {
    const result = await client.callTool({
      name: 'ghost_get_page',
      arguments: { id: '/etc/passwd' },
    });
    expect(result.isError).toBe(true);
  });

  it('ghost_get_page accepts valid slug', async () => {
    const result = await client.callTool({
      name: 'ghost_get_page',
      arguments: { slug: 'about' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Test Post');
  });

  it('ghost_update_page rejects invalid ID', async () => {
    const result = await client.callTool({
      name: 'ghost_update_page',
      arguments: { id: 'bad-id!' },
    });
    expect(result.isError).toBe(true);
  });
});

// ── Sync Tools ───────────────────────────────────

describe('Sync Tools (MCP integration)', () => {
  let client: Client;
  let ghost: GhostAdminApi;
  let tmpDir: string;

  beforeAll(async () => {
    ghost = createMockGhost();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-sync-'));
    ({ client } = await setupMcpClient(ghost));
  });

  afterAll(async () => {
    await client.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('ghost_push_local rejects path outside ~/blog-drafts/', async () => {
    // Create a file in temp dir (outside blog-drafts)
    const outsideFile = path.join(tmpDir, 'evil.md');
    await fs.writeFile(outsideFile, '# Evil');

    const result = await client.callTool({
      name: 'ghost_push_local',
      arguments: { file_path: outsideFile },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('~/blog-drafts/');
    expect(result.isError).toBe(true);
  });

  it('ghost_push_local rejects path traversal', async () => {
    const result = await client.callTool({
      name: 'ghost_push_local',
      arguments: { file_path: '/etc/passwd' },
    });
    expect(result.isError).toBe(true);
  });

  it('ghost_sync_status returns status table', async () => {
    const result = await client.callTool({
      name: 'ghost_sync_status',
      arguments: {},
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Sync Status');
  });
});

// ── Post Tools — email/newsletter surface ────────

describe('Post Tools — email/newsletter read surface', () => {
  let client: Client;

  beforeAll(async () => {
    const ghost = createMockGhost({
      email: {
        id: 'email-id',
        status: 'submitted',
        recipient_filter: 'status:-free',
      },
      newsletter: { id: 'nl-id', name: 'Weekly', slug: 'weekly' },
      email_segment: 'status:-free',
      status: 'scheduled',
    });
    ({ client } = await setupMcpClient(ghost));
  });

  afterAll(async () => {
    await client.close();
  });

  it('ghost_get_post surfaces newsletter slug, segment, email status, recipient filter', async () => {
    const result = await client.callTool({
      name: 'ghost_get_post',
      arguments: { id: '507f1f77bcf86cd799439011' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('| Newsletter | weekly |');
    expect(text).toContain('| Email segment | status:-free |');
    expect(text).toContain('| Email status | submitted |');
    expect(text).toContain('| Email recipient filter | status:-free |');
    expect(text).toContain('| Created |');
  });

  it('ghost_get_post shows (none)/not sent for unset newsletter', async () => {
    const ghost = createMockGhost();
    const { client: c } = await setupMcpClient(ghost);
    const result = await c.callTool({
      name: 'ghost_get_post',
      arguments: { id: '507f1f77bcf86cd799439011' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('| Newsletter | (none) |');
    expect(text).toContain('| Email segment | all |');
    expect(text).toContain('| Email status | not sent |');
    expect(text).toContain('| Email recipient filter | N/A |');
    await c.close();
  });

  it('ghost_list_posts auto-shows email columns when status=scheduled', async () => {
    const result = await client.callTool({
      name: 'ghost_list_posts',
      arguments: { status: 'scheduled' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Newsletter');
    expect(text).toContain('Segment');
    expect(text).toMatch(/\| Email\s+\|/);
    expect(text).toContain('weekly');
  });

  it('ghost_list_posts hides email columns by default (no status filter)', async () => {
    const ghost = createMockGhost();
    const { client: c } = await setupMcpClient(ghost);
    const result = await c.callTool({
      name: 'ghost_list_posts',
      arguments: {},
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).not.toContain('Newsletter');
    expect(text).not.toContain('Segment');
    await c.close();
  });

  it('ghost_list_posts respects explicit show_email=true', async () => {
    const ghost = createMockGhost({
      newsletter: { id: 'n', name: 'W', slug: 'weekly' },
    });
    const { client: c } = await setupMcpClient(ghost);
    const result = await c.callTool({
      name: 'ghost_list_posts',
      arguments: { show_email: true },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Newsletter');
    expect(text).toContain('weekly');
    await c.close();
  });
});

// ── Page Tools — write/read alignment ────────────

describe('Page Tools — write/read alignment', () => {
  let client: Client;
  let ghost: GhostAdminApi;

  beforeAll(async () => {
    ghost = createMockGhost();
    ({ client } = await setupMcpClient(ghost));
  });

  afterAll(async () => {
    await client.close();
  });

  it('ghost_get_page surfaces visibility, feature_image, meta fields, excerpt', async () => {
    const result = await client.callTool({
      name: 'ghost_get_page',
      arguments: { slug: 'about' },
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('| Visibility |');
    expect(text).toContain('| Feature image |');
    expect(text).toContain('| Meta title |');
    expect(text).toContain('| Meta description |');
    expect(text).toContain('| Excerpt |');
  });

  it('ghost_list_pages includes Vis column', async () => {
    const result = await client.callTool({
      name: 'ghost_list_pages',
      arguments: {},
    });
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toContain('Vis');
  });

  it('ghost_update_page accepts and forwards meta/feature_image/excerpt', async () => {
    vi.clearAllMocks();
    await client.callTool({
      name: 'ghost_update_page',
      arguments: {
        id: '507f1f77bcf86cd799439011',
        meta_title: 'SEO Title',
        meta_description: 'SEO Desc',
        feature_image: 'https://cdn.example.com/img.png',
        custom_excerpt: 'Short excerpt',
      },
    });
    expect(ghost.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({
        meta_title: 'SEO Title',
        meta_description: 'SEO Desc',
        feature_image: 'https://cdn.example.com/img.png',
        custom_excerpt: 'Short excerpt',
      })
    );
  });

  it('ghost_update_page accepts and forwards visibility (in second call)', async () => {
    vi.clearAllMocks();
    await client.callTool({
      name: 'ghost_update_page',
      arguments: {
        id: '507f1f77bcf86cd799439011',
        visibility: 'members',
      },
    });
    expect(ghost.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'members' })
    );
  });
});

// ── Sync Tools — tag clearing regression ─────────

describe('Sync Tools — tag clearing on update (regression #1)', () => {
  let client: Client;
  let ghost: GhostAdminApi;
  let indexManager: IndexManager;
  let syncDir: string;

  beforeAll(async () => {
    ghost = createMockGhost();
    indexManager = new IndexManager();
    syncDir = path.resolve(process.env.HOME || '~', 'blog-drafts');
    await fs.mkdir(syncDir, { recursive: true });
    ({ client } = await setupMcpClient(ghost, indexManager));
  });

  afterAll(async () => {
    await client.close();
    // Clean up test file
    await fs.unlink(path.join(syncDir, 'tag-test.md')).catch(() => {});
  });

  it('sends empty tags array on update when markdown has no tags', async () => {
    const testFile = path.join(syncDir, 'tag-test.md');
    await fs.writeFile(testFile, '# No Tags Post\n\nBody without frontmatter tags.');

    // Pre-seed index so push triggers update path
    await indexManager.setEntry('tag-test.md', {
      ghostId: '507f1f77bcf86cd799439011',
      ghostSlug: 'tag-test',
      ghostStatus: 'draft',
      ghostUpdatedAt: '2026-01-01T00:00:00.000Z',
      localHash: 'old-hash',
      lastPushed: '2026-01-01T00:00:00.000Z',
    });

    await client.callTool({
      name: 'ghost_push_local',
      arguments: { file_path: testFile },
    });

    expect(ghost.updatePost).toHaveBeenCalledWith(
      expect.objectContaining({ tags: [] })
    );
  });
});
