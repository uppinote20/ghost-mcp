/** @covers src/parsers/markdown-parser.ts */
import { describe, it, expect } from 'vitest';
import {
  parseBlogMarkdown,
  toMobiledoc,
  toLexical,
} from './markdown-parser.js';

// ── parseBlogMarkdown ────────────────────────────

describe('parseBlogMarkdown', () => {
  const validMarkdown = `# My Blog Post Title

**소스 프로젝트:** \`ghost-mcp\`
**기술 스택:** TypeScript, Node.js
**키워드:** MCP, Ghost, 블로그

---

<!-- 본문 시작 -->

This is the **body** of the blog post.

It has multiple paragraphs.

<!-- MCP 파싱 마커: 본문은 여기까지, 아래는 SEO 설정 -->

## Ghost SEO 설정

| Field | Value |
|-------|-------|
| Post URL | \`my-blog-post-title\` |
| Meta title | My Blog Post - SEO Title |
| Meta description | A description for search engines |
| Excerpt | A short excerpt for the post |
`;

  it('extracts title from # heading', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.title).toBe('My Blog Post Title');
  });

  it('extracts body between markers', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.body).toContain('This is the **body**');
    expect(result.body).toContain('multiple paragraphs');
    // Should NOT include SEO section
    expect(result.body).not.toContain('Ghost SEO');
  });

  it('extracts slug from Post URL', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.slug).toBe('my-blog-post-title');
  });

  it('extracts meta title', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.metaTitle).toBe('My Blog Post - SEO Title');
  });

  it('extracts meta description', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.metaDescription).toBe(
      'A description for search engines'
    );
  });

  it('extracts excerpt', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.excerpt).toBe('A short excerpt for the post');
  });

  it('extracts source project', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.sourceProject).toBe('ghost-mcp');
  });

  it('extracts tech stack as array', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.techStack).toEqual(['TypeScript', 'Node.js']);
  });

  it('extracts keywords as array', () => {
    const result = parseBlogMarkdown(validMarkdown);
    expect(result.keywords).toEqual(['MCP', 'Ghost', '블로그']);
  });

  // ── Edge cases ──

  it('returns empty strings when markers are missing', () => {
    const result = parseBlogMarkdown('Just some text');
    expect(result.title).toBe('');
    expect(result.body).toBe('');
    expect(result.slug).toBe('');
  });

  it('handles missing SEO section gracefully', () => {
    const md = `# Title

<!-- 본문 시작 -->
Body here
<!-- MCP 파싱 마커: end -->
`;
    const result = parseBlogMarkdown(md);
    expect(result.title).toBe('Title');
    expect(result.body).toBe('Body here');
    expect(result.slug).toBe('');
    expect(result.metaTitle).toBe('');
  });

  it('handles title with special characters', () => {
    const md = `# React에서 "useState" vs useReducer — 비교 & 분석

<!-- 본문 시작 -->
content
<!-- MCP 파싱 마커 -->
`;
    const result = parseBlogMarkdown(md);
    expect(result.title).toBe(
      'React에서 "useState" vs useReducer — 비교 & 분석'
    );
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
    const result = toMobiledoc('test');
    expect(() => JSON.parse(result)).not.toThrow();
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
    const result = toLexical('test');
    expect(() => JSON.parse(result)).not.toThrow();
  });
});
