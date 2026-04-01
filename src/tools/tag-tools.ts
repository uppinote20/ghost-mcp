/** @tested src/tools/tools.test.ts */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GhostAdminApi } from '../ghost/client.js';
import { ghostId, safeSlug, audit } from '../validation.js';

export function registerTagTools(server: McpServer, ghost: GhostAdminApi) {
  server.tool(
    'ghost_list_tags',
    'List all Ghost tags with post counts',
    {
      include_count: z
        .boolean()
        .optional()
        .describe('Include post count per tag (default true)'),
      order: z
        .string()
        .optional()
        .describe('Sort order (e.g. "name asc", "count.posts desc")'),
    },
    async ({ include_count, order }) => {
      const { tags } = await ghost.getTags({
        includeCount: include_count !== false,
        order,
      });

      const rows = tags.map((t) => {
        const count = t.count?.posts ?? '-';
        const desc = (t.description || '').slice(0, 40);
        return `| ${t.name.padEnd(25)} | ${t.slug.padEnd(25)} | ${String(count).padStart(5)} | ${desc.padEnd(40)} |`;
      });

      const header =
        '| Name                      | Slug                      | Posts | Description                              |';
      const sep =
        '|---------------------------|---------------------------|-------|------------------------------------------|';

      return {
        content: [
          {
            type: 'text' as const,
            text: [`Total: ${tags.length} tags`, '', header, sep, ...rows].join(
              '\n'
            ),
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_create_tag',
    'Create a new Ghost tag',
    {
      name: z.string().describe('Tag name'),
      slug: z.string().optional().describe('Tag slug (auto-generated if omitted)'),
      description: z.string().optional().describe('Tag description'),
    },
    async ({ name, slug, description }) => {
      const tag = await ghost.createTag({ name, slug, description });
      audit('create_tag', { id: tag.id, name: tag.name });

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Tag created!`,
              '',
              `| Field | Value |`,
              `|-------|-------|`,
              `| ID | ${tag.id} |`,
              `| Name | ${tag.name} |`,
              `| Slug | ${tag.slug} |`,
            ].join('\n'),
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_delete_tag',
    'Delete a Ghost tag',
    {
      id: ghostId.optional().describe('Tag ID to delete'),
      slug: safeSlug.optional().describe('Tag slug to delete (looked up to find ID)'),
      confirm: z.boolean().describe('Must be true to confirm deletion'),
    },
    async ({ id, slug, confirm }) => {
      if (!id && !slug) {
        return {
          content: [
            { type: 'text' as const, text: 'Either id or slug is required.' },
          ],
        };
      }

      if (!confirm) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Deletion cancelled. Set confirm=true to proceed.',
            },
          ],
        };
      }

      let tagId = id;
      let tagName = id || slug;

      if (!tagId && slug) {
        const { tags } = await ghost.getTags();
        const found = tags.find((t) => t.slug === slug);
        if (!found) {
          return {
            content: [
              { type: 'text' as const, text: `Tag not found with slug: ${slug}` },
            ],
          };
        }
        tagId = found.id;
        tagName = found.name;
      }

      await ghost.deleteTag(tagId!);
      audit('delete_tag', { id: tagId, name: tagName });

      return {
        content: [
          { type: 'text' as const, text: `Deleted tag: ${tagName}` },
        ],
      };
    }
  );

  server.tool(
    'ghost_analyze_tags',
    'Analyze tag usage patterns — find unused, low-use, and similar tags',
    {},
    async () => {
      const { tags } = await ghost.getTags({ includeCount: true });

      const unused = tags.filter((t) => (t.count?.posts ?? 0) === 0);
      const lowUse = tags.filter((t) => {
        const count = t.count?.posts ?? 0;
        return count >= 1 && count <= 2;
      });

      // Find similar tag names (substring match or edit distance <= 2)
      const similar: string[] = [];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const a = tags[i].slug;
          const b = tags[j].slug;
          if (
            a.includes(b) ||
            b.includes(a) ||
            levenshtein(a, b) <= 2
          ) {
            similar.push(`"${tags[i].name}" ↔ "${tags[j].name}"`);
          }
        }
      }

      const lines = [
        `# Tag Analysis`,
        '',
        `Total tags: ${tags.length}`,
        '',
        `## Unused tags (0 posts)`,
        ...(unused.length
          ? unused.map((t) => `- ${t.name} (${t.slug}) — id: ${t.id}`)
          : ['None']),
        '',
        `## Low-use tags (1-2 posts)`,
        ...(lowUse.length
          ? lowUse.map(
              (t) =>
                `- ${t.name} (${t.count?.posts} posts)`
            )
          : ['None']),
        '',
        `## Potentially similar tags`,
        ...(similar.length ? similar.map((s) => `- ${s}`) : ['None']),
      ];

      return {
        content: [{ type: 'text' as const, text: lines.join('\n') }],
      };
    }
  );
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
