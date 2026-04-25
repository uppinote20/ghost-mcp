/** @tested src/ghost/client.test.ts */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  GhostPost,
  GhostPage,
  GhostPageUpdate,
  GhostTag,
  GhostNewsletter,
  GhostPostCreate,
  GhostPostUpdate,
  GhostPagination,
} from './types.js';

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64url');
}

interface GhostApiResponse<T> {
  meta?: { pagination?: GhostPagination };
  posts?: T[];
  pages?: T[];
  tags?: T[];
}

export class GhostAdminApi {
  private url: string;
  private adminApiKey: string;

  constructor(url: string, adminApiKey: string) {
    this.url = url.replace(/\/$/, '');
    this.adminApiKey = adminApiKey;
  }

  private generateToken(): string {
    const [id, secret] = this.adminApiKey.split(':');

    const iat = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT', kid: id };
    const payload = { iat, exp: iat + 5 * 60, aud: '/admin/' };

    const encodeJson = (obj: object): string =>
      toBase64Url(Buffer.from(JSON.stringify(obj)));

    const base64Header = encodeJson(header);
    const base64Payload = encodeJson(payload);

    const signature = toBase64Url(
      crypto
        .createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(`${base64Header}.${base64Payload}`)
        .digest()
    );

    return `${base64Header}.${base64Payload}.${signature}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.generateToken();
    const response = await fetch(
      `${this.url}/ghost/api/admin/${endpoint}`,
      {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Ghost ${token}`,
          ...options.headers,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const code =
        (error as Record<string, unknown[]>)?.errors?.[0] &&
        typeof (error as Record<string, unknown[]>).errors[0] === 'object'
          ? ((error as Record<string, unknown[]>).errors[0] as Record<string, string>).type ?? 'UnknownError'
          : 'UnknownError';
      throw new Error(`Ghost API error ${response.status}: ${code}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // Posts

  async getPosts(options: {
    status?: string;
    tag?: string;
    search?: string;
    limit?: number;
    page?: number;
  } = {}): Promise<{ posts: GhostPost[]; pagination?: GhostPagination }> {
    const params = new URLSearchParams();

    const filters: string[] = [];
    if (options.status) filters.push(`status:${options.status}`);
    if (options.tag) filters.push(`tag:${options.tag}`);
    if (filters.length > 0) params.set('filter', filters.join('+'));

    if (options.search) params.set('search', options.search);
    params.set('limit', String(options.limit || 50));
    if (options.page) params.set('page', String(options.page));
    params.set('include', 'tags,email,newsletter');
    params.set('order', 'updated_at desc');

    const response = await this.request<GhostApiResponse<GhostPost>>(
      `posts/?${params.toString()}`
    );

    return {
      posts: response.posts || [],
      pagination: response.meta?.pagination,
    };
  }

  async getPost(id: string): Promise<GhostPost> {
    const response = await this.request<{ posts: GhostPost[] }>(
      `posts/${id}/?formats=mobiledoc,lexical,html,plaintext&include=tags,email,newsletter`
    );
    return response.posts[0];
  }

  async getPostBySlug(slug: string): Promise<GhostPost> {
    const response = await this.request<{ posts: GhostPost[] }>(
      `posts/slug/${slug}/?formats=mobiledoc,lexical,html,plaintext&include=tags,email,newsletter`
    );
    return response.posts[0];
  }

  async createPost(post: GhostPostCreate): Promise<GhostPost> {
    const response = await this.request<{ posts: GhostPost[] }>('posts/', {
      method: 'POST',
      body: JSON.stringify({ posts: [post] }),
    });
    return response.posts[0];
  }

  async updatePost(
    post: GhostPostUpdate,
    options?: { newsletter?: string; email_segment?: string }
  ): Promise<GhostPost> {
    const { id, ...data } = post;
    const params = new URLSearchParams();
    if (options?.newsletter) params.set('newsletter', options.newsletter);
    if (options?.email_segment) params.set('email_segment', options.email_segment);
    const qs = params.toString();
    const endpoint = `posts/${id}/${qs ? `?${qs}` : ''}`;
    const response = await this.request<{ posts: GhostPost[] }>(endpoint, {
      method: 'PUT',
      body: JSON.stringify({ posts: [data] }),
    });
    return response.posts[0];
  }

  async deletePost(id: string): Promise<void> {
    await this.request(`posts/${id}/`, { method: 'DELETE' });
  }

  // Pages

  async getPages(options: {
    status?: string;
    limit?: number;
    page?: number;
  } = {}): Promise<{ pages: GhostPage[]; pagination?: GhostPagination }> {
    const params = new URLSearchParams();

    if (options.status) params.set('filter', `status:${options.status}`);
    params.set('limit', String(options.limit || 50));
    if (options.page) params.set('page', String(options.page));
    params.set('include', 'tags');
    params.set('order', 'updated_at desc');

    const response = await this.request<GhostApiResponse<GhostPage>>(
      `pages/?${params.toString()}`
    );

    return {
      pages: response.pages || [],
      pagination: response.meta?.pagination,
    };
  }

  async getPage(id: string): Promise<GhostPage> {
    const response = await this.request<{ pages: GhostPage[] }>(
      `pages/${id}/?formats=mobiledoc,lexical,html,plaintext&include=tags`
    );
    return response.pages[0];
  }

  async getPageBySlug(slug: string): Promise<GhostPage> {
    const response = await this.request<{ pages: GhostPage[] }>(
      `pages/slug/${slug}/?formats=mobiledoc,lexical,html,plaintext&include=tags`
    );
    return response.pages[0];
  }

  async updatePage(page: GhostPageUpdate): Promise<GhostPage> {
    const { id, ...data } = page;
    const response = await this.request<{ pages: GhostPage[] }>(
      `pages/${id}/`,
      {
        method: 'PUT',
        body: JSON.stringify({ pages: [data] }),
      }
    );
    return response.pages[0];
  }

  // Newsletters

  async getNewsletters(): Promise<GhostNewsletter[]> {
    const response = await this.request<{ newsletters: GhostNewsletter[] }>(
      'newsletters/?include=count.members,count.posts&limit=all'
    );
    return response.newsletters || [];
  }

  // Tags

  async getTags(options: {
    includeCount?: boolean;
    order?: string;
    limit?: number;
  } = {}): Promise<{ tags: GhostTag[]; pagination?: GhostPagination }> {
    const params = new URLSearchParams();
    if (options.includeCount) params.set('include', 'count.posts');
    params.set('order', options.order || 'name asc');
    params.set('limit', String(options.limit || 'all'));

    const response = await this.request<GhostApiResponse<GhostTag>>(
      `tags/?${params.toString()}`
    );

    return {
      tags: response.tags || [],
      pagination: response.meta?.pagination,
    };
  }

  async createTag(tag: {
    name: string;
    slug?: string;
    description?: string;
  }): Promise<GhostTag> {
    const response = await this.request<{ tags: GhostTag[] }>('tags/', {
      method: 'POST',
      body: JSON.stringify({ tags: [tag] }),
    });
    return response.tags[0];
  }

  async deleteTag(id: string): Promise<void> {
    await this.request(`tags/${id}/`, { method: 'DELETE' });
  }

  // Images

  async uploadImage(filePath: string): Promise<string> {
    const token = this.generateToken();
    const fileName = path.basename(filePath);
    const fileBuffer = fs.readFileSync(filePath);

    const ext = path.extname(fileName).toLowerCase();
    const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
    if (fileBuffer.length > MAX_UPLOAD_BYTES) {
      throw new Error(`File exceeds maximum upload size of 20 MB`);
    }

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const contentType = mimeTypes[ext] || 'image/png';

    const boundary = `----formdata-${crypto.randomUUID()}`;
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
    ];

    const header = Buffer.from(bodyParts.join(''));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, fileBuffer, footer]);

    const response = await fetch(
      `${this.url}/ghost/api/admin/images/upload/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Ghost ${token}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body,
      }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => null);
      const code =
        (error as Record<string, unknown[]>)?.errors?.[0] &&
        typeof (error as Record<string, unknown[]>).errors[0] === 'object'
          ? ((error as Record<string, unknown[]>).errors[0] as Record<string, string>).type ?? 'UploadError'
          : 'UploadError';
      throw new Error(`Ghost image upload error ${response.status}: ${code}`);
    }

    const result = (await response.json()) as { images: { url: string }[] };
    return result.images[0].url;
  }

  // Health check

  async testConnection(): Promise<boolean> {
    try {
      await this.request<{ site: unknown }>('site/');
      return true;
    } catch {
      return false;
    }
  }
}
