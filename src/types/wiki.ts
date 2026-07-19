export type ArticleStatus =
  | "draft"
  | "published"
  | "archived";

export type TocLevel = 2 | 3 | 4;

export interface TocItem {
  id: string;
  label: string;
  level: TocLevel;
}

export interface QuickFactRow {
  id: string;
  label?: string;
  value: string;
  href?: string;
}

export interface QuickFactSection {
  id: string;
  title?: string;
  rows: QuickFactRow[];
}

export interface QuickFacts {
  enabled: boolean;
  title: string;
  summary: string;
  defaultOpen: boolean;
  sections: QuickFactSection[];
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Article {
  id: string;

  title: string;
  slug: string;
  subtitle: string;
  summary: string;

  leadHtml: string;
  contentHtml: string;
  contentJson: Record<string, unknown> | null;
  plainText: string;

  status: ArticleStatus;
  featured: boolean;

  toc: TocItem[];
  quickFacts: QuickFacts;

  categoryIds: string[];
  aliases: string[];
  relatedArticleIds: string[];

  viewCount: number;

  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface ArticleRevision {
    id: string;
    articleId: string;
    revisionNumber: number;

    title: string;
    slug: string;
    subtitle: string;
    summary: string;

    leadHtml: string;
    contentHtml: string;
    contentJson: Record<string, unknown> | null;
    plainText: string;

    status: ArticleStatus;
    featured: boolean;

    toc: TocItem[];
    quickFacts: QuickFacts;

    categoryIds: string[];
    aliases: string[];
    relatedArticleIds: string[];

    publishedAt: string | null;

    changeNote: string;
    createdAt: string;
}

export interface HomepageConfig {
  welcomeTitle: string;
  welcomeDescription: string;
  featuredArticleId: string | null;
  recentArticleLimit: number;
  popularArticleLimit: number;
  visibleCategoryIds: string[];
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  description: string;
  language: string;
}

export interface WikiDatabase {
  version: number;
  settings: SiteSettings;
  homepage: HomepageConfig;
  categories: Category[];
  articles: Article[];
  revisions: ArticleRevision[];
}