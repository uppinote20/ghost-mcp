/** @tested src/tools/tools.test.ts */
import fs from 'fs/promises';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GhostAdminApi } from '../ghost/client.js';
import { parseBlogMarkdown, toMobiledoc, toLexical } from '../parsers/markdown-parser.js';
import { IndexManager, computeHash } from '../sync/index-manager.js';
import { validateSyncPath, audit } from '../validation.js';

export function registerSyncTools(
  server: McpServer,
  ghost: GhostAdminApi,
  indexManager: IndexManager
) {
  server.tool(
    'ghost_push_local',
    'Push a local markdown file to Ghost as a draft. Parses blog format, creates or updates the post. Returns existing tags so Claude can suggest appropriate tags.',
    {
      file_path: z
        .string()
        .describe('Absolute path to the markdown file'),
    },
    async ({ file_path: filePath }) => {
      let resolved: string;
      try {
        resolved = validateSyncPath(filePath);
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: Path must be within ~/blog-drafts/`,
            },
          ],
          isError: true,
        };
      }

      const content = await fs.readFile(resolved, 'utf-8');
      const parsed = parseBlogMarkdown(content);

      if (!parsed.title) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Could not extract title (# heading) from the markdown file.',
            },
          ],
          isError: true,
        };
      }

      if (!parsed.body) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: Could not extract body. Make sure <!-- 본문 시작 --> and <!-- MCP 파싱 마커 --> markers exist.',
            },
          ],
          isError: true,
        };
      }

      const filename = path.basename(resolved);
      const localHash = computeHash(content);

      const existing = await indexManager.getEntry(filename);

      let post;
      let action: string;

      if (existing) {
        // Update: detect editor format from existing post
        const current = await ghost.getPost(existing.ghostId);
        const isLexical = !!current.lexical;
        const contentField = isLexical
          ? { lexical: toLexical(parsed.body) }
          : { mobiledoc: toMobiledoc(parsed.body) };

        post = await ghost.updatePost({
          id: existing.ghostId,
          updated_at: current.updated_at,
          title: parsed.title,
          ...contentField,
          slug: parsed.slug || undefined,
          meta_title: parsed.metaTitle || undefined,
          meta_description: parsed.metaDescription || undefined,
          custom_excerpt: parsed.excerpt || undefined,
        });
        action = 'updated';
      } else {
        // Create: use lexical for new posts
        post = await ghost.createPost({
          title: parsed.title,
          lexical: toLexical(parsed.body),
          slug: parsed.slug || undefined,
          meta_title: parsed.metaTitle || undefined,
          meta_description: parsed.metaDescription || undefined,
          custom_excerpt: parsed.excerpt || undefined,
          status: 'draft',
        });
        action = 'created';
      }

      audit('push_local', { action, file: filename, ghostId: post.id, slug: post.slug });

      await indexManager.setEntry(filename, {
        ghostId: post.id,
        ghostSlug: post.slug,
        ghostStatus: post.status,
        ghostUpdatedAt: post.updated_at,
        localHash,
        lastPushed: new Date().toISOString(),
      });

      // Fetch existing tags for Claude to suggest
      const { tags } = await ghost.getTags({ includeCount: true });
      const tagList = tags
        .map((t) => `- ${t.name} (${t.slug}) — ${t.count?.posts ?? 0} posts`)
        .join('\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Post ${action} successfully!`,
              '',
              `| Field | Value |`,
              `|-------|-------|`,
              `| ID | ${post.id} |`,
              `| Title | ${parsed.title} |`,
              `| Slug | ${post.slug} |`,
              `| Status | ${post.status} |`,
              `| Meta title | ${parsed.metaTitle || 'N/A'} |`,
              `| Meta desc | ${parsed.metaDescription || 'N/A'} |`,
              `| Excerpt | ${parsed.excerpt || 'N/A'} |`,
              `| Source project | ${parsed.sourceProject || 'N/A'} |`,
              '',
              `**Tags are not yet assigned.** Review the content and pick appropriate tags from the list below, then use \`ghost_update_post\` to apply them.`,
              '',
              `## Existing tags`,
              tagList,
              '',
              `## Content keywords for reference`,
              `Source project: ${parsed.sourceProject || 'N/A'}`,
              `Tech stack: ${parsed.techStack.join(', ') || 'N/A'}`,
              `Keywords: ${parsed.keywords.join(', ') || 'N/A'}`,
            ].join('\n'),
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_sync_status',
    'Compare local blog-drafts files with Ghost posts to show sync status',
    {},
    async () => {
      const localFiles = await indexManager.getLocalFiles();
      const entries = await indexManager.getAllEntries();

      const lines: string[] = [
        `# Sync Status`,
        '',
        `Local files in ~/blog-drafts/: ${localFiles.length}`,
        `Tracked entries: ${Object.keys(entries).length}`,
        '',
        `| File | Status | Ghost Status | Changed? |`,
        `|------|--------|--------------|----------|`,
      ];

      for (const file of localFiles) {
        const entry = entries[file.filename];
        if (!entry) {
          lines.push(
            `| ${file.filename} | **untracked** | - | - |`
          );
        } else {
          const changed = file.hash !== entry.localHash ? 'yes' : 'no';
          lines.push(
            `| ${file.filename} | synced | ${entry.ghostStatus} | ${changed} |`
          );
        }
      }

      // Check for entries with no local file
      for (const [filename, entry] of Object.entries(entries)) {
        const hasLocal = localFiles.some((f) => f.filename === filename);
        if (!hasLocal) {
          lines.push(
            `| ${filename} | **local deleted** | ${entry.ghostStatus} | - |`
          );
        }
      }

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    }
  );
}
