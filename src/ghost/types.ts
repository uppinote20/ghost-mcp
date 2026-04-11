export interface GhostPost {
  id: string;
  uuid: string;
  title: string;
  slug: string;
  status: 'draft' | 'published' | 'scheduled' | 'sent';
  published_at: string | null;
  updated_at: string;
  created_at: string;
  excerpt: string | null;
  custom_excerpt: string | null;
  feature_image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  visibility: 'public' | 'members' | 'paid' | 'tiers';
  tags: GhostTag[];
  html: string | null;
  plaintext: string | null;
  mobiledoc: string | null;
  lexical: string | null;
}

export interface GhostTag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  count?: { posts: number };
}

export interface GhostPostCreate {
  title: string;
  mobiledoc?: string;
  lexical?: string;
  slug?: string;
  status?: 'draft' | 'published' | 'scheduled';
  visibility?: 'public' | 'members' | 'paid' | 'tiers';
  custom_excerpt?: string;
  feature_image?: string;
  meta_title?: string;
  meta_description?: string;
  tags?: { name: string }[];
}

export interface GhostPostUpdate {
  id: string;
  updated_at: string;
  title?: string;
  mobiledoc?: string;
  lexical?: string;
  slug?: string;
  status?: 'draft' | 'published' | 'scheduled';
  visibility?: 'public' | 'members' | 'paid' | 'tiers';
  published_at?: string;
  custom_excerpt?: string;
  feature_image?: string;
  meta_title?: string;
  meta_description?: string;
  tags?: { name: string }[];
}

export type GhostPage = GhostPost;
export type GhostPageUpdate = GhostPostUpdate;

export interface GhostNewsletter {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived';
  subscribe_on_signup: boolean;
  count?: { members: number; posts: number };
}

export interface GhostPagination {
  page: number;
  limit: number;
  pages: number;
  total: number;
  next: number | null;
  prev: number | null;
}
