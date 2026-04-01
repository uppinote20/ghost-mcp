/** @tested src/parsers/markdown-parser.test.ts */
export interface ParsedBlogPost {
  title: string;
  body: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  excerpt: string;
  sourceProject: string;
  techStack: string[];
  keywords: string[];
}

const END_MARKER = /<!--\s*MCP 파싱 마커/;

/**
 * Parse blog markdown written by /blog command.
 *
 * Structure:
 *   # Title
 *   ... metadata block ...
 *   ---
 *   <!-- 본문 시작 -->
 *   ... body ...
 *   <!-- MCP 파싱 마커: 본문은 여기까지, ... -->
 *   ... Ghost SEO 설정 table ...
 */
export function parseBlogMarkdown(content: string): ParsedBlogPost {
  // 1. Title: first # heading
  const titleMatch = content.match(/^# (.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // 2. Body: between markers
  const bodyMatch = content.match(
    /<!--\s*본문 시작\s*-->([\s\S]*?)(?=<!--\s*MCP 파싱 마커)/
  );
  const body = bodyMatch ? bodyMatch[1].trim() : '';

  // 3. SEO section: after the end marker
  const seoSection = content.split(END_MARKER)[1] || '';

  // Ghost SEO 설정 table parsing
  const postUrlMatch = seoSection.match(/\| Post URL \| `([^`]+)` \|/);
  const metaTitleMatch = seoSection.match(/\| Meta title \| (.+?) \|/);
  const metaDescMatch = seoSection.match(/\| Meta description \| (.+?) \|/);
  const excerptMatch = seoSection.match(/\| Excerpt \| (.+?) \|/);

  const slug = postUrlMatch ? postUrlMatch[1].trim() : '';
  const metaTitle = metaTitleMatch ? metaTitleMatch[1].trim() : '';
  const metaDescription = metaDescMatch ? metaDescMatch[1].trim() : '';
  const excerpt = excerptMatch ? excerptMatch[1].trim() : '';

  // 4. Metadata block
  const sourceProjectMatch = content.match(
    /\*\*소스 프로젝트:\*\*\s*`([^`]+)`/
  );
  const sourceProject = sourceProjectMatch
    ? sourceProjectMatch[1].trim()
    : '';

  const techStackMatch = content.match(/\*\*기술 스택:\*\*\s*(.+)/);
  const techStack = techStackMatch
    ? techStackMatch[1]
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const keywordsMatch = content.match(/\*\*키워드:\*\*\s*(.+)/);
  const keywords = keywordsMatch
    ? keywordsMatch[1]
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return {
    title,
    body,
    slug,
    metaTitle,
    metaDescription,
    excerpt,
    sourceProject,
    techStack,
    keywords,
  };
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
