# ghost-mcp

MCP server for managing [Ghost](https://ghost.org) blogs from AI coding editors.

Create, edit, publish, and sync blog posts directly from Claude Code, Cursor, or any MCP-compatible client.

## Features

- **Posts** &mdash; list, get, create, update, delete, publish with newsletter
- **Pages** &mdash; list, get, update
- **Tags** &mdash; list, create, delete, analyze usage patterns
- **Images** &mdash; upload local files to Ghost CDN
- **Sync** &mdash; push local markdown files (`~/blog-drafts/`) to Ghost as drafts
- **Newsletters** &mdash; list available newsletters for email publishing

## Quick Start

```bash
npx -y @uppinote/ghost-mcp@latest setup
```

The setup wizard registers the server in your editor and prompts for the Ghost URL + Admin API Key:

```
┌  ghost-mcp setup
│
◆  Ghost blog URL
│  https://your-blog.com
│
◆  Admin API Key (Ghost → Settings → Integrations)
│  ************************************
│
◆  Register in
│  ● Claude Code
│  ○ Cursor
│  ○ Print config (manual setup)
│
└  Restart your editor to activate.
```

After setup, your editor is registered with `npx -y @uppinote/ghost-mcp@latest`, so you'll automatically pick up new releases on the next start (npm cache TTL ~24h).

> The setup wizard shows a one-time GitHub star prompt. Pass `--yes` to skip the prompt, or `--star` to star without asking.

## Updating

Because the editor is registered with `npx -y ...@latest`, restarts pick up new versions automatically. To force-refresh immediately, clear npm's npx cache or restart the editor twice.

## Manual Setup

If you prefer to configure manually, add to your MCP settings:

```json
{
  "mcpServers": {
    "ghost-blog": {
      "command": "npx",
      "args": ["-y", "@uppinote/ghost-mcp@latest"],
      "env": {
        "GHOST_URL": "https://your-blog.com",
        "GHOST_ADMIN_API_KEY": "your_id:your_hex_secret"
      }
    }
  }
}
```

| Editor | Settings file |
|--------|--------------|
| Claude Code | `~/.claude/settings.json` |
| Cursor | `~/.cursor/mcp.json` |

## Migrating from v1.0.x / v1.1.x

Earlier versions registered the server with `node /path/to/dist/index.js`, which doesn't auto-update. To switch to the npx flow:

1. Run `npx -y @uppinote/ghost-mcp@latest setup` and choose "overwrite" when it detects the existing entry.
2. Restart your editor.
3. (Optional) Delete the old `git clone` directory.

## Development (contributors)

```bash
git clone https://github.com/uppinote20/ghost-mcp.git
cd ghost-mcp
npm install
npm run build
npm run setup    # registers from local dist via the same wizard
npm test
```

### Getting Your API Key

1. Ghost Admin → Settings → Integrations
2. Add custom integration
3. Copy the **Admin API Key** (format: `id:secret`)

## Available Tools

| Tool | Description |
|------|-------------|
| `ghost_list_posts` | List posts with optional status/tag/search filters |
| `ghost_get_post` | Get a single post by ID or slug |
| `ghost_create_post` | Create a new post from markdown |
| `ghost_update_post` | Update post content, metadata, status, visibility |
| `ghost_delete_post` | Delete a post (requires confirmation) |
| `ghost_upload_image` | Upload a local image file to Ghost |
| `ghost_list_newsletters` | List available newsletters |
| `ghost_list_pages` | List pages |
| `ghost_get_page` | Get a single page by ID or slug |
| `ghost_update_page` | Update page content and metadata |
| `ghost_list_tags` | List all tags with post counts |
| `ghost_create_tag` | Create a new tag |
| `ghost_delete_tag` | Delete a tag by ID or slug |
| `ghost_analyze_tags` | Find unused, low-use, and similar tags |
| `ghost_push_local` | Push a local markdown file to Ghost as a draft |
| `ghost_sync_status` | Compare local files with Ghost posts |

## Markdown Formats for `ghost_push_local`

Three formats are auto-detected:

**1. YAML Frontmatter (recommended)**

```markdown
---
slug: my-post
meta_title: SEO Title
meta_description: A short description
excerpt: Custom excerpt
tags: [dev, ghost]   # or block sequence:
# tags:
#   - dev
#   - ghost
---

# My Blog Post

Content here...
```

**2. Plain Markdown**

```markdown
# My Blog Post

Content here — no metadata, Ghost auto-generates the slug.
```

**3. Legacy Markers** (internal)

Uses `<!-- 본문 시작 -->` / `<!-- MCP 파싱 마커 -->` HTML comment markers with an SEO table.

## Security

- HTTPS enforced for non-localhost connections
- API key format validation (`id:secret`, hex-encoded secret)
- Ghost ID and slug input validation (prevents path traversal / SSRF)
- File path validation for sync operations (restricted to `~/blog-drafts/`)
- Symlink traversal prevention
- Error message normalization (no internal details leaked)
- Upload size limit (20 MB) and SVG blocked
- Audit logging to stderr for all write operations

## Development

```bash
npm run dev        # Watch mode (tsc --watch)
npm test           # Run tests
npm run test:watch # Watch mode tests
npm run build      # Build for production
```

## License

MIT
