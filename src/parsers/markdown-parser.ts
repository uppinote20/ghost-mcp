/** @tested src/parsers/markdown-parser.test.ts */
export interface ParsedBlogPost {
  title: string;
  body: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  tags: string[];
}

const LEGACY_BODY_START = /<!--\s*본문 시작\s*-->/;
const LEGACY_END_MARKER = /<!--\s*MCP 파싱 마커/;
const FRONTMATTER_FENCE = /^---\s*$/m;

/**
 * Auto-detect format and parse markdown into a Ghost-ready structure.
 *
 * Supported formats:
 *
 * 1. **Standard frontmatter** (recommended for public use):
 *    ---
 *    slug: my-post
 *    meta_title: SEO Title
 *    meta_description: Description
 *    excerpt: Short excerpt
 *    tags: [dev, ghost]
 *    ---
 *    # Title
 *    Body content...
 *
 * 2. **Plain markdown** (no frontmatter, no markers):
 *    # Title
 *    Body content...
 *
 * 3. **Legacy marker format** (internal /blog command):
 *    <!-- 본문 시작 --> ... <!-- MCP 파싱 마커 -->
 */
export function parseBlogMarkdown(content: string): ParsedBlogPost {
  // Auto-detect: legacy markers take priority if present
  if (LEGACY_BODY_START.test(content) && LEGACY_END_MARKER.test(content)) {
    return parseLegacyFormat(content);
  }

  // Check for YAML frontmatter (starts with ---)
  if (content.trimStart().startsWith('---')) {
    return parseFrontmatterFormat(content);
  }

  // Plain markdown: title from first # heading, rest is body
  return parsePlainMarkdown(content);
}

/** Standard YAML frontmatter format */
function parseFrontmatterFormat(content: string): ParsedBlogPost {
  const trimmed = content.trimStart();
  // Split on the second --- fence
  const afterFirst = trimmed.slice(3); // skip opening ---
  const closingIdx = afterFirst.search(FRONTMATTER_FENCE);

  if (closingIdx === -1) {
    return parsePlainMarkdown(content);
  }

  const yamlBlock = afterFirst.slice(0, closingIdx).trim();
  const bodyContent = afterFirst.slice(closingIdx).replace(FRONTMATTER_FENCE, '').trim();

  // Simple YAML key-value parser (no dependency needed)
  // Normalize hyphenated keys (meta-title → meta_title)
  const rawMeta = parseSimpleYaml(yamlBlock);
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawMeta)) {
    meta[k.replace(/-/g, '_')] = v;
  }

  // Title: from frontmatter or first # heading in body
  const titleMatch = bodyContent.match(/^# (.+)$/m);
  const title = (meta.title as string) || (titleMatch ? titleMatch[1].trim() : '');

  // Body: everything after title heading, or full body if no heading
  let body = bodyContent;
  if (titleMatch) {
    body = bodyContent.slice(bodyContent.indexOf(titleMatch[0]) + titleMatch[0].length).trim();
  }

  // Tags: array or comma-separated string
  let tags: string[] = [];
  if (meta.tags) {
    if (Array.isArray(meta.tags)) {
      tags = meta.tags.map(String);
    } else {
      tags = String(meta.tags).split(/[,，]/).map(s => s.trim()).filter(Boolean);
    }
  }

  return {
    title,
    body,
    slug: String(meta.slug || meta.post_url || ''),
    metaTitle: String(meta.meta_title || ''),
    metaDescription: String(meta.meta_description || ''),
    excerpt: String(meta.excerpt || meta.custom_excerpt || ''),
    tags,
  };
}

/** Plain markdown: # Title + body, no metadata */
function parsePlainMarkdown(content: string): ParsedBlogPost {
  const titleMatch = content.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '';

  let body = content;
  if (titleMatch) {
    body = content.slice(content.indexOf(titleMatch[0]) + titleMatch[0].length).trim();
  }

  return { title, body, slug: '', metaTitle: '', metaDescription: '', excerpt: '', tags: [] };
}

/** Legacy format with Korean markers (internal /blog command) */
function parseLegacyFormat(content: string): ParsedBlogPost {
  const titleMatch = content.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const bodyMatch = content.match(
    /<!--\s*본문 시작\s*-->([\s\S]*?)(?=<!--\s*MCP 파싱 마커)/
  );
  const body = bodyMatch ? bodyMatch[1].trim() : '';

  const seoSection = content.split(LEGACY_END_MARKER)[1] || '';

  const postUrlMatch = seoSection.match(/\| Post URL \| `([^`]+)` \|/);
  const metaTitleMatch = seoSection.match(/\| Meta title \| (.+?) \|/);
  const metaDescMatch = seoSection.match(/\| Meta description \| (.+?) \|/);
  const excerptMatch = seoSection.match(/\| Excerpt \| (.+?) \|/);

  return {
    title,
    body,
    slug: postUrlMatch ? postUrlMatch[1].trim() : '',
    metaTitle: metaTitleMatch ? metaTitleMatch[1].trim() : '',
    metaDescription: metaDescMatch ? metaDescMatch[1].trim() : '',
    excerpt: excerptMatch ? excerptMatch[1].trim() : '',
    tags: [],
  };
}

/** Minimal YAML parser for frontmatter (key: value, inline/block arrays) */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey = '';

  for (let i = 0; i < lines.length; i++) {
    // Block sequence item: "  - value"
    const seqMatch = lines[i].match(/^\s+-\s+(.+)$/);
    if (seqMatch && currentKey) {
      const arr = result[currentKey];
      if (Array.isArray(arr)) {
        arr.push(seqMatch[1].trim().replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    // Key-value pair (supports hyphens in keys: meta-title, og-image)
    const match = lines[i].match(/^([\w][\w_-]*):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    currentKey = key;

    // Inline array: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      result[key] = value.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (value === '' || value === '~' || value === 'null') {
      // Empty value — could be start of a block sequence
      result[key] = [];
    } else {
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  // Convert empty arrays back to empty string if no items were added
  for (const [key, val] of Object.entries(result)) {
    if (Array.isArray(val) && val.length === 0) {
      result[key] = '';
    }
  }

  return result;
}

/** Convert markdown body to Ghost mobiledoc JSON string */
export function toMobiledoc(markdown: string): string {
  return JSON.stringify({
    version: '0.3.1',
    markups: [],
    atoms: [],
    cards: [['markdown', { markdown }]],
    sections: [[10, 0]],
  });
}

/** Convert markdown body to Ghost lexical JSON string */
export function toLexical(markdown: string): string {
  return JSON.stringify({
    root: {
      children: [{ type: 'markdown', markdown }],
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  });
}
