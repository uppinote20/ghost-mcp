/** @covers src/parsers/markdown-parser.ts */
import { describe, it, expect } from 'vitest';
import {
  parseBlogMarkdown,
  toMobiledoc,
  toLexical,
} from './markdown-parser.js';

// ── Standard frontmatter format ──────────────────

describe('parseBlogMarkdown — frontmatter format', () => {
  const frontmatterMd = `---
slug: my-post
meta_title: SEO Title Here
meta_description: A description for search engines
excerpt: A short excerpt
tags: [dev, ghost, mcp]
---

# My Blog Post

This is the body content.

It has **multiple** paragraphs.
`;

  it('extracts title from # heading', () => {
    expect(parseBlogMarkdown(frontmatterMd).title).toBe('My Blog Post');
  });

  it('extracts body after title', () => {
    const result = parseBlogMarkdown(frontmatterMd);
    expect(result.body).toContain('This is the body content.');
    expect(result.body).toContain('**multiple** paragraphs');
    expect(result.body).not.toContain('slug:');
  });

  it('extracts slug', () => {
    expect(parseBlogMarkdown(frontmatterMd).slug).toBe('my-post');
  });

  it('extracts meta_title', () => {
    expect(parseBlogMarkdown(frontmatterMd).metaTitle).toBe('SEO Title Here');
  });

  it('extracts meta_description', () => {
    expect(parseBlogMarkdown(frontmatterMd).metaDescription).toBe(
      'A description for search engines'
    );
  });

  it('extracts excerpt', () => {
    expect(parseBlogMarkdown(frontmatterMd).excerpt).toBe('A short excerpt');
  });

  it('extracts tags as array', () => {
    expect(parseBlogMarkdown(frontmatterMd).tags).toEqual(['dev', 'ghost', 'mcp']);
  });

  it('supports title in frontmatter instead of heading', () => {
    const md = `---
title: From Frontmatter
---

Body without heading.
`;
    const result = parseBlogMarkdown(md);
    expect(result.title).toBe('From Frontmatter');
    expect(result.body).toBe('Body without heading.');
  });

  it('frontmatter title takes priority over heading', () => {
    const md = `---
title: Frontmatter Title
---

# Heading Title

Body here.
`;
    const result = parseBlogMarkdown(md);
    expect(result.title).toBe('Frontmatter Title');
    expect(result.body).toBe('Body here.');
  });

  it('handles empty frontmatter values', () => {
    const md = `---
slug:
meta_title: ~
---

# Title

Body.
`;
    const result = parseBlogMarkdown(md);
    expect(result.slug).toBe('');
    expect(result.metaTitle).toBe('');
  });

  it('handles quoted values', () => {
    const md = `---
slug: "my-slug"
meta_title: 'Single Quoted'
---

# Title

Body.
`;
    const result = parseBlogMarkdown(md);
    expect(result.slug).toBe('my-slug');
    expect(result.metaTitle).toBe('Single Quoted');
  });

  it('handles tags as comma-separated string', () => {
    const md = `---
tags: dev, ghost, mcp
---

# Title

Body.
`;
    expect(parseBlogMarkdown(md).tags).toEqual(['dev', 'ghost', 'mcp']);
  });

  it('handles YAML block sequence tags', () => {
    const md = `---
tags:
  - dev
  - ghost
  - mcp
---

# Title

Body.
`;
    expect(parseBlogMarkdown(md).tags).toEqual(['dev', 'ghost', 'mcp']);
  });

  it('handles hyphenated YAML keys', () => {
    const md = `---
meta-title: Hyphenated Key
meta_description: Underscore Key
---

# Title

Body.
`;
    const result = parseBlogMarkdown(md);
    expect(result.metaTitle).toBe('Hyphenated Key');
    expect(result.metaDescription).toBe('Underscore Key');
  });
});

// ── Plain markdown format ────────────────────────

describe('parseBlogMarkdown — plain markdown', () => {
  it('extracts title and body from plain markdown', () => {
    const md = `# My Post

This is the content.

Second paragraph.
`;
    const result = parseBlogMarkdown(md);
    expect(result.title).toBe('My Post');
    expect(result.body).toContain('This is the content.');
    expect(result.body).toContain('Second paragraph.');
  });

  it('returns empty title when no heading', () => {
    const result = parseBlogMarkdown('Just some text without heading.');
    expect(result.title).toBe('');
    expect(result.body).toBe('Just some text without heading.');
  });

  it('returns empty metadata', () => {
    const result = parseBlogMarkdown('# Title\n\nBody');
    expect(result.slug).toBe('');
    expect(result.metaTitle).toBe('');
    expect(result.tags).toEqual([]);
  });

  it('handles title with special characters', () => {
    const md = `# React에서 "useState" vs useReducer — 비교 & 분석

content here
`;
    expect(parseBlogMarkdown(md).title).toBe(
      'React에서 "useState" vs useReducer — 비교 & 분석'
    );
  });
});

// ── Legacy marker format ─────────────────────────

describe('parseBlogMarkdown — legacy marker format', () => {
  const legacyMd = `# Legacy Post

**소스 프로젝트:** \`ghost-mcp\`

---

<!-- 본문 시작 -->

This is the **body**.

<!-- MCP 파싱 마커: 본문은 여기까지 -->

## Ghost SEO 설정

| Field | Value |
|-------|-------|
| Post URL | \`legacy-slug\` |
| Meta title | Legacy SEO Title |
| Meta description | Legacy description |
| Excerpt | Legacy excerpt |
`;

  it('detects legacy format by markers', () => {
    const result = parseBlogMarkdown(legacyMd);
    expect(result.title).toBe('Legacy Post');
    expect(result.body).toBe('This is the **body**.');
  });

  it('extracts SEO fields from table', () => {
    const result = parseBlogMarkdown(legacyMd);
    expect(result.slug).toBe('legacy-slug');
    expect(result.metaTitle).toBe('Legacy SEO Title');
    expect(result.metaDescription).toBe('Legacy description');
    expect(result.excerpt).toBe('Legacy excerpt');
  });

  it('returns empty tags for legacy format', () => {
    expect(parseBlogMarkdown(legacyMd).tags).toEqual([]);
  });
});

// ── toMobiledoc ──────────────────────────────────

describe('toMobiledoc', () => {
  it('wraps markdown in mobiledoc structure', () => {
    const result = JSON.parse(toMobiledoc('# Hello'));
    expect(result.version).toBe('0.3.1');
    expect(result.cards).toEqual([['markdown', { markdown: '# Hello' }]]);
    expect(result.sections).toEqual([[10, 0]]);
  });

  it('preserves markdown content exactly', () => {
    const md = '**bold** and `code` and [link](http://x.com)';
    const result = JSON.parse(toMobiledoc(md));
    expect(result.cards[0][1].markdown).toBe(md);
  });

  it('returns valid JSON string', () => {
    expect(() => JSON.parse(toMobiledoc('test'))).not.toThrow();
  });
});

// ── toLexical ────────────────────────────────────

describe('toLexical', () => {
  it('wraps markdown in lexical structure', () => {
    const result = JSON.parse(toLexical('# Hello'));
    expect(result.root.type).toBe('root');
    expect(result.root.version).toBe(1);
    expect(result.root.children).toEqual([
      { type: 'markdown', markdown: '# Hello' },
    ]);
  });

  it('preserves markdown content exactly', () => {
    const md = '한글 콘텐츠와 emoji 🎉';
    const result = JSON.parse(toLexical(md));
    expect(result.root.children[0].markdown).toBe(md);
  });

  it('returns valid JSON string', () => {
    expect(() => JSON.parse(toLexical('test'))).not.toThrow();
  });
});
