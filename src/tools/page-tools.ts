/** @tested src/tools/tools.test.ts */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GhostAdminApi } from '../ghost/client.js';
import type { GhostPageUpdate } from '../ghost/types.js';
import { ghostId, safeSlug, audit } from '../validation.js';

export function registerPageTools(server: McpServer, ghost: GhostAdminApi) {
  server.tool(
    'ghost_list_pages',
    'List Ghost pages with optional filters',
    {
      status: z
        .enum(['draft', 'published', 'scheduled'])
        .optional()
        .describe('Filter by page status'),
      limit: z.number().optional().describe('Max pages to return (default 50)'),
    },
    async ({ status, limit }) => {
      const { pages, pagination } = await ghost.getPages({ status, limit });

      const rows = pages.map((p) => {
        const tags = p.tags.map((t) => t.name).join(', ');
        const date =
          p.published_at?.slice(0, 10) || p.updated_at?.slice(0, 10) || '';
        const vis = (p.visibility || 'public').slice(0, 6).padEnd(6);
        return `| ${p.status.padEnd(9)} | ${vis} | ${date} | ${p.title.slice(0, 50).padEnd(50)} | ${tags.slice(0, 30).padEnd(30)} | ${p.slug} |`;
      });

      const header =
        '| Status    | Vis    | Date       | Title                                              | Tags                           | Slug |';
      const sep =
        '|-----------|--------|------------|----------------------------------------------------|---------------------------------|------|';

      const total = pagination?.total ?? pages.length;
      const summary = `Total: ${total} pages`;

      return {
        content: [
          {
            type: 'text' as const,
            text: [summary, '', header, sep, ...rows].join('\n'),
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_get_page',
    'Get a single Ghost page by ID or slug',
    {
      id: ghostId.optional().describe('Page ID'),
      slug: safeSlug.optional().describe('Page slug'),
      include_content: z
        .boolean()
        .optional()
        .describe('Include full HTML, lexical/mobiledoc content (default false)'),
    },
    async ({ id, slug, include_content }) => {
      if (!id && !slug) {
        return {
          content: [
            { type: 'text' as const, text: 'Error: Provide either id or slug' },
          ],
          isError: true,
        };
      }

      const page = id
        ? await ghost.getPage(id)
        : await ghost.getPageBySlug(slug!);

      const tags = page.tags.map((t) => t.name).join(', ');
      const lines = [
        `**${page.title}**`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| ID | ${page.id} |`,
        `| Slug | ${page.slug} |`,
        `| Status | ${page.status} |`,
        `| Published | ${page.published_at || 'N/A'} |`,
        `| Updated | ${page.updated_at} |`,
        `| Tags | ${tags} |`,
        `| Visibility | ${page.visibility || 'public'} |`,
        `| Feature image | ${page.feature_image || 'N/A'} |`,
        `| Meta title | ${page.meta_title || 'N/A'} |`,
        `| Meta description | ${page.meta_description || 'N/A'} |`,
        `| Excerpt | ${page.custom_excerpt || 'N/A'} |`,
      ];

      if (include_content) {
        if (page.lexical) {
          lines.push('', '---', '', '**Lexical:**', '', page.lexical);
        } else if (page.mobiledoc) {
          lines.push('', '---', '', '**Mobiledoc:**', '', page.mobiledoc);
        }
        if (page.html) {
          lines.push('', '---', '', '**HTML:**', '', page.html);
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'ghost_update_page',
    'Update a Ghost page (supports raw lexical or mobiledoc)',
    {
      id: ghostId.describe('Page ID'),
      title: z.string().optional().describe('New title'),
      lexical: z
        .string()
        .optional()
        .describe('Raw lexical JSON string (for pages using lexical editor)'),
      mobiledoc: z
        .string()
        .optional()
        .describe('Raw mobiledoc JSON string (for legacy pages)'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Replace tags (tag names)'),
      status: z
        .enum(['draft', 'published', 'scheduled'])
        .optional()
        .describe('New status'),
      slug: z.string().optional().describe('New slug'),
      visibility: z
        .enum(['public', 'members', 'paid', 'tiers'])
        .optional()
        .describe('Page visibility'),
      feature_image: z.string().optional().describe('Feature image URL'),
      meta_title: z.string().optional().describe('SEO meta title'),
      meta_description: z
        .string()
        .optional()
        .describe('SEO meta description'),
      custom_excerpt: z.string().optional().describe('Custom excerpt'),
    },
    async ({
      id,
      title,
      lexical,
      mobiledoc,
      tags,
      status,
      slug,
      visibility,
      feature_image,
      meta_title,
      meta_description,
      custom_excerpt,
    }) => {
      let current = await ghost.getPage(id);

      const otherFields: Omit<GhostPageUpdate, 'id' | 'updated_at'> = {
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(status !== undefined && { status }),
        ...(tags !== undefined && { tags: tags.map((name) => ({ name })) }),
        ...(lexical !== undefined && { lexical }),
        ...(mobiledoc !== undefined && { mobiledoc }),
        ...(feature_image !== undefined && { feature_image }),
        ...(meta_title !== undefined && { meta_title }),
        ...(meta_description !== undefined && { meta_description }),
        ...(custom_excerpt !== undefined && { custom_excerpt }),
      };

      if (Object.keys(otherFields).length > 0) {
        current = await ghost.updatePage({
          id,
          updated_at: current.updated_at,
          ...otherFields,
        });
      }

      audit('update_page', { id, fields: Object.keys(otherFields) });

      let page = current;
      if (visibility !== undefined) {
        page = await ghost.updatePage({
          id,
          updated_at: current.updated_at,
          visibility,
        });
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Page updated successfully!`,
              '',
              `| Field | Value |`,
              `|-------|-------|`,
              `| ID | ${page.id} |`,
              `| Title | ${page.title} |`,
              `| Status | ${page.status} |`,
              `| Updated | ${page.updated_at} |`,
            ].join('\n'),
          },
        ],
      };
    }
  );
}
