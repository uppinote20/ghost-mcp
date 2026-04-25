/** @tested src/tools/tools.test.ts */
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import type { GhostAdminApi } from '../ghost/client.js';
import type { GhostPost, GhostPostUpdate } from '../ghost/types.js';
import { toMobiledoc, toLexical } from '../parsers/markdown-parser.js';
import { ghostId, safeSlug, audit } from '../validation.js';

export function registerPostTools(server: McpServer, ghost: GhostAdminApi) {
  server.tool(
    'ghost_list_posts',
    'List Ghost blog posts with optional filters',
    {
      status: z
        .enum(['draft', 'published', 'scheduled', 'sent'])
        .optional()
        .describe(
          'Filter by post status. "sent" returns posts that were emailed as a newsletter (system-set, read-only — cannot be set via ghost_update_post).'
        ),
      tag: z.string().optional().describe('Filter by tag slug'),
      search: z.string().optional().describe('Search in title and content'),
      limit: z.number().optional().describe('Max posts to return (default 50)'),
      show_email: z
        .boolean()
        .optional()
        .describe(
          'Append Newsletter / Filter / Email columns. Auto-enabled when status is "scheduled" or "sent". Useful for verifying which scheduled posts will trigger an email on publish.'
        ),
    },
    async ({ status, tag, search, limit, show_email }) => {
      const { posts, pagination } = await ghost.getPosts({
        status,
        tag,
        search,
        limit,
      });

      const showEmail =
        show_email ?? (status === 'scheduled' || status === 'sent');

      const rows = posts.map((p) => {
        const tags = p.tags.map((t) => t.name).join(', ');
        const date =
          p.published_at?.slice(0, 10) || p.updated_at?.slice(0, 10) || '';
        const vis = (p.visibility || 'public').slice(0, 6).padEnd(6);
        const base = `| ${p.status.padEnd(9)} | ${vis} | ${date} | ${p.title.slice(0, 50).padEnd(50)} | ${tags.slice(0, 30).padEnd(30)} | ${p.slug} |`;
        if (!showEmail) return base;
        const news = (p.newsletter?.slug || '-').slice(0, 18).padEnd(18);
        const filter = (
          p.email?.recipient_filter ??
          p.email_segment ??
          '-'
        )
          .slice(0, 14)
          .padEnd(14);
        const emailStatus = (p.email?.status || '-').slice(0, 10).padEnd(10);
        return `${base} ${news} | ${filter} | ${emailStatus} |`;
      });

      const header = showEmail
        ? '| Status    | Vis    | Date       | Title                                              | Tags                           | Slug | Newsletter         | Filter         | Email      |'
        : '| Status    | Vis    | Date       | Title                                              | Tags                           | Slug |';
      const sep = showEmail
        ? '|-----------|--------|------------|----------------------------------------------------|---------------------------------|------|--------------------|----------------|------------|'
        : '|-----------|--------|------------|----------------------------------------------------|---------------------------------|------|';

      const total = pagination?.total ?? posts.length;
      const summary = `Total: ${total} posts`;

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
    'ghost_get_post',
    'Get a single Ghost post by ID or slug',
    {
      id: ghostId.optional().describe('Post ID'),
      slug: safeSlug.optional().describe('Post slug'),
      include_content: z
        .boolean()
        .optional()
        .describe('Include full content (default false)'),
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

      const post = id
        ? await ghost.getPost(id)
        : await ghost.getPostBySlug(slug!);

      const tags = post.tags.map((t) => t.name).join(', ');
      const lines = [
        `**${post.title}**`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| ID | ${post.id} |`,
        `| Slug | ${post.slug} |`,
        `| Status | ${post.status} |`,
        `| Published | ${post.published_at || 'N/A'} |`,
        `| Updated | ${post.updated_at} |`,
        `| Created | ${post.created_at || 'N/A'} |`,
        `| Tags | ${tags} |`,
        `| Visibility | ${post.visibility || 'public'} |`,
        `| Feature image | ${post.feature_image || 'N/A'} |`,
        `| Meta title | ${post.meta_title || 'N/A'} |`,
        `| Meta description | ${post.meta_description || 'N/A'} |`,
        `| Excerpt | ${post.custom_excerpt || 'N/A'} |`,
        `| Newsletter | ${post.newsletter?.slug || '(none)'} |`,
        `| Email recipient filter | ${post.email?.recipient_filter ?? post.email_segment ?? '(none)'} |`,
        `| Email status | ${post.email?.status || 'N/A'} |`,
      ];

      if (include_content) {
        if (post.lexical) {
          lines.push('', '---', '', '**Lexical:**', '', post.lexical);
        } else if (post.mobiledoc) {
          lines.push('', '---', '', '**Mobiledoc:**', '', post.mobiledoc);
        }
        if (post.plaintext) {
          lines.push('', '---', '', '**Plaintext:**', '', post.plaintext.slice(0, 3000));
          if (post.plaintext.length > 3000) {
            lines.push(`\n... (truncated, total ${post.plaintext.length} chars)`);
          }
        }
      }

      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    }
  );

  server.tool(
    'ghost_create_post',
    'Create a new Ghost post from markdown content',
    {
      title: z.string().describe('Post title'),
      markdown: z.string().describe('Post content in markdown'),
      slug: z.string().optional().describe('URL slug'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Tag names to attach'),
      meta_title: z.string().optional().describe('SEO meta title'),
      meta_description: z
        .string()
        .optional()
        .describe('SEO meta description'),
      custom_excerpt: z.string().optional().describe('Custom excerpt'),
      feature_image: z.string().optional().describe('Feature image URL'),
      status: z
        .enum(['draft', 'published'])
        .optional()
        .describe('Post status (default draft)'),
      visibility: z
        .enum(['public', 'members', 'paid', 'tiers'])
        .optional()
        .describe('Post visibility (default public)'),
    },
    async ({
      title,
      markdown,
      slug,
      tags,
      meta_title,
      meta_description,
      custom_excerpt,
      feature_image,
      status,
      visibility,
    }) => {
      const post = await ghost.createPost({
        title,
        lexical: toLexical(markdown),
        slug,
        status: status || 'draft',
        visibility: visibility || 'public',
        tags: tags?.map((name) => ({ name })),
        feature_image,
        meta_title,
        meta_description,
        custom_excerpt,
      });
      audit('create_post', { id: post.id, title, slug: post.slug });

      const tagNames = post.tags.map((t) => t.name).join(', ');

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Post created successfully!`,
              '',
              `| Field | Value |`,
              `|-------|-------|`,
              `| ID | ${post.id} |`,
              `| Title | ${post.title} |`,
              `| Slug | ${post.slug} |`,
              `| Status | ${post.status} |`,
              `| Tags | ${tagNames} |`,
            ].join('\n'),
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_update_post',
    'Update an existing Ghost post (fetches updated_at automatically for optimistic locking)',
    {
      id: ghostId.describe('Post ID'),
      title: z.string().optional().describe('New title'),
      markdown: z.string().optional().describe('New markdown content (converted to mobiledoc)'),
      lexical: z
        .string()
        .optional()
        .describe('Raw lexical JSON string (for posts using lexical editor)'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Replace tags (tag names)'),
      status: z
        .enum(['draft', 'published', 'scheduled'])
        .optional()
        .describe('New status'),
      published_at: z
        .string()
        .optional()
        .describe('Publication date (ISO 8601, e.g. 2026-02-13T00:00:00.000Z). Required when scheduling.'),
      meta_title: z.string().optional().describe('SEO meta title'),
      meta_description: z
        .string()
        .optional()
        .describe('SEO meta description'),
      custom_excerpt: z.string().optional().describe('Custom excerpt'),
      feature_image: z.string().optional().describe('Feature image URL'),
      slug: z.string().optional().describe('New slug'),
      visibility: z.enum(['public', 'members', 'paid', 'tiers']).optional()
        .describe('Post visibility (public, members, paid, tiers)'),
      newsletter: z.string().optional()
        .describe('Newsletter slug to send email (enables "Publish and email"). Use ghost_list_newsletters to find slugs.'),
      email_segment: z.string().optional()
        .describe('Email recipient segment (default "all"). Examples: "all", "status:free", "status:-free"'),
    },
    async ({
      id,
      title,
      markdown,
      lexical,
      tags,
      status,
      published_at,
      meta_title,
      meta_description,
      custom_excerpt,
      feature_image,
      slug,
      visibility,
      newsletter,
      email_segment,
    }) => {
      // Fetch current post for optimistic locking
      let current = await ghost.getPost(id);

      // Detect editor format: lexical posts need lexical, mobiledoc posts need mobiledoc
      const isLexical = !!current.lexical;

      // Convert markdown to the correct editor format
      let contentField: Record<string, string> = {};
      if (markdown !== undefined) {
        contentField = isLexical
          ? { lexical: toLexical(markdown) }
          : { mobiledoc: toMobiledoc(markdown) };
      }

      // Separate visibility from other fields — Ghost API ignores visibility
      // when sent alongside other fields in certain cases.
      const otherFields: Omit<GhostPostUpdate, 'id' | 'updated_at'> = {
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(status !== undefined && { status }),
        ...(published_at !== undefined && { published_at }),
        ...(meta_title !== undefined && { meta_title }),
        ...(meta_description !== undefined && { meta_description }),
        ...(custom_excerpt !== undefined && { custom_excerpt }),
        ...(feature_image !== undefined && { feature_image }),
        ...(tags !== undefined && { tags: tags.map((name) => ({ name })) }),
        ...(lexical !== undefined && { lexical }),
        ...contentField,
      };

      // Newsletter options — only passed when status changes to published
      const newsletterOpts = newsletter
        ? { newsletter, email_segment: email_segment || 'all' }
        : undefined;

      // Step 1: Update non-visibility fields
      if (Object.keys(otherFields).length > 0) {
        current = await ghost.updatePost(
          { id, updated_at: current.updated_at, ...otherFields },
          newsletterOpts
        );
      }

      audit('update_post', { id, fields: Object.keys(otherFields) });

      // Step 2: Update visibility separately
      let post: GhostPost;
      if (visibility !== undefined) {
        post = await ghost.updatePost({
          id,
          updated_at: current.updated_at,
          visibility,
        });
      } else {
        post = current;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `Post updated successfully!`,
              '',
              `| Field | Value |`,
              `|-------|-------|`,
              `| ID | ${post.id} |`,
              `| Title | ${post.title} |`,
              `| Status | ${post.status} |`,
              `| Updated | ${post.updated_at} |`,
            ].join('\n'),
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_delete_post',
    'Delete a Ghost post permanently',
    {
      id: ghostId.describe('Post ID to delete'),
      confirm: z
        .boolean()
        .describe('Must be true to confirm deletion'),
    },
    async ({ id, confirm }) => {
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

      const post = await ghost.getPost(id);
      await ghost.deletePost(id);
      audit('delete_post', { id, title: post.title });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Deleted post: "${post.title}" (${post.id})`,
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_upload_image',
    'Upload a local image file to Ghost and return the hosted URL',
    {
      file_path: z.string().describe('Absolute path to the image file'),
    },
    async ({ file_path }) => {
      const resolved = path.resolve(file_path);
      if (!fs.existsSync(resolved)) {
        return {
          content: [
            { type: 'text' as const, text: `Error: File not found: ${resolved}` },
          ],
          isError: true,
        };
      }

      audit('upload_image', { path: resolved });
      const url = await ghost.uploadImage(resolved);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Image uploaded successfully!\n\n| Field | Value |\n|-------|-------|\n| URL | ${url} |\n| Source | ${file_path} |`,
          },
        ],
      };
    }
  );

  server.tool(
    'ghost_list_newsletters',
    'List available Ghost newsletters (use slug for ghost_update_post newsletter parameter)',
    {},
    async () => {
      const newsletters = await ghost.getNewsletters();

      const rows = newsletters.map((n) => {
        const members = n.count?.members ?? '-';
        const posts = n.count?.posts ?? '-';
        return `| ${n.name.slice(0, 30).padEnd(30)} | ${n.slug.slice(0, 25).padEnd(25)} | ${String(n.status).padEnd(8)} | ${String(members).padStart(7)} | ${String(posts).padStart(5)} |`;
      });

      const header =
        '| Name                           | Slug                      | Status   | Members | Posts |';
      const sep =
        '|--------------------------------|---------------------------|----------|---------|-------|';

      return {
        content: [
          {
            type: 'text' as const,
            text: [`${newsletters.length} newsletter(s)`, '', header, sep, ...rows].join('\n'),
          },
        ],
      };
    }
  );
}
