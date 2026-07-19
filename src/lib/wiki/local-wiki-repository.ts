import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import slugify from "slugify";

import type {
  Article,
  ArticleRevision,
  ArticleStatus,
  Category,
  QuickFacts,
  WikiDatabase,
} from "../../types/wiki";

import {
    articleEditorInputSchema,
    type ArticleEditorInput,
    type ParsedArticleEditorInput,
  } from "./article-input";

import { prepareWikiContent } from "./article-content";

const DATABASE_PATH = path.resolve(
  process.cwd(),
  "data",
  "wiki-db.json",
);

let mutationQueue: Promise<void> = Promise.resolve();

export type WikiRepositoryErrorCode =
  | "ARTICLE_NOT_FOUND"
  | "REVISION_NOT_FOUND"
  | "SLUG_CONFLICT"
  | "INVALID_SLUG"
  | "INVALID_CATEGORY"
  | "INVALID_RELATED_ARTICLE";

export class WikiRepositoryError extends Error {
  readonly code: WikiRepositoryErrorCode;
  readonly status: number;

  constructor(
    code: WikiRepositoryErrorCode,
    message: string,
    status = 400,
  ) {
    super(message);

    this.name = "WikiRepositoryError";
    this.code = code;
    this.status = status;
  }
}

async function readDatabaseDirect(): Promise<WikiDatabase> {
  const rawDatabase = await readFile(
    DATABASE_PATH,
    "utf8",
  );

  try {
    return JSON.parse(rawDatabase) as WikiDatabase;
  } catch (error) {
    console.error(
      "No fue posible interpretar wiki-db.json.",
      error,
    );

    throw new Error(
      "La base de datos local contiene JSON inválido.",
    );
  }
}

async function writeDatabaseDirect(
  database: WikiDatabase,
): Promise<void> {
  const serializedDatabase =
    `${JSON.stringify(database, null, 2)}\n`;

  await writeFile(
    DATABASE_PATH,
    serializedDatabase,
    "utf8",
  );
}

async function readDatabase(): Promise<WikiDatabase> {
  await mutationQueue;

  return readDatabaseDirect();
}

async function mutateDatabase<T>(
  mutation: (
    database: WikiDatabase,
  ) => T | Promise<T>,
): Promise<T> {
  let output!: T;

  const operation = mutationQueue.then(async () => {
    const database = await readDatabaseDirect();

    output = await mutation(database);

    await writeDatabaseDirect(database);
  });

  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );

  await operation;

  return output;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es");
}

function normalizeSlug(value: string): string {
  return slugify(value, {
    lower: true,
    strict: true,
    trim: true,
    locale: "es",
  });
}

function normalizeStringList(
  values: string[],
): string[] {
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function sortArticlesByUpdatedDate(
  articles: Article[],
): Article[] {
  return [...articles].sort(
    (firstArticle, secondArticle) =>
      new Date(secondArticle.updatedAt).getTime() -
      new Date(firstArticle.updatedAt).getTime(),
  );
}

function sortArticlesByPopularity(
  articles: Article[],
): Article[] {
  return [...articles].sort(
    (firstArticle, secondArticle) =>
      secondArticle.viewCount -
      firstArticle.viewCount,
  );
}

function countBrokenLinks(article: Article): number {
  const matches = article.contentHtml.match(
    /class=["'][^"']*missing-link[^"']*["']/g,
  );

  return matches?.length ?? 0;
}

function normalizeQuickFacts(
    quickFacts: ParsedArticleEditorInput["quickFacts"],
  ): QuickFacts {
  return {
    enabled: quickFacts.enabled,
    title: quickFacts.title,
    summary: quickFacts.summary,
    defaultOpen: quickFacts.defaultOpen,

    sections: quickFacts.sections.map((section) => ({
      id: section.id || randomUUID(),
      title: section.title || "",

      rows: section.rows.map((row) => ({
        id: row.id || randomUUID(),
        label: row.label || "",
        value: row.value,
        href: row.href || undefined,
      })),
    })),
  };
}

function validateCategoryIds(
  database: WikiDatabase,
  categoryIds: string[],
): string[] {
  const normalizedIds =
    normalizeStringList(categoryIds);

  const existingIds = new Set(
    database.categories.map(
      (category) => category.id,
    ),
  );

  const invalidId = normalizedIds.find(
    (categoryId) => !existingIds.has(categoryId),
  );

  if (invalidId) {
    throw new WikiRepositoryError(
      "INVALID_CATEGORY",
      `La categoría ${invalidId} no existe.`,
      400,
    );
  }

  return normalizedIds;
}

function validateRelatedArticleIds(
  database: WikiDatabase,
  articleId: string,
  relatedArticleIds: string[],
): string[] {
  const normalizedIds = normalizeStringList(
    relatedArticleIds,
  ).filter(
    (relatedArticleId) =>
      relatedArticleId !== articleId,
  );

  const existingIds = new Set(
    database.articles.map(
      (article) => article.id,
    ),
  );

  const invalidId = normalizedIds.find(
    (relatedArticleId) =>
      !existingIds.has(relatedArticleId),
  );

  if (invalidId) {
    throw new WikiRepositoryError(
      "INVALID_RELATED_ARTICLE",
      `El artículo relacionado ${invalidId} no existe.`,
      400,
    );
  }

  return normalizedIds;
}

function validateUniqueSlug(
  database: WikiDatabase,
  slug: string,
  ignoredArticleId?: string,
): void {
  const conflictingArticle =
    database.articles.find(
      (article) =>
        article.id !== ignoredArticleId &&
        article.slug.toLocaleLowerCase("es") ===
          slug.toLocaleLowerCase("es"),
    );

  if (conflictingArticle) {
    throw new WikiRepositoryError(
      "SLUG_CONFLICT",
      `La dirección /wiki/${slug} ya está siendo utilizada por "${conflictingArticle.title}".`,
      409,
    );
  }
}

function getArticleOrThrow(
  database: WikiDatabase,
  articleId: string,
): Article {
  const article = database.articles.find(
    (candidate) => candidate.id === articleId,
  );

  if (!article) {
    throw new WikiRepositoryError(
      "ARTICLE_NOT_FOUND",
      "El artículo solicitado no existe.",
      404,
    );
  }

  return article;
}

function createRevision(
  database: WikiDatabase,
  article: Article,
  changeNote: string,
): ArticleRevision {
  const existingRevisionNumbers =
    database.revisions
      .filter(
        (revision) =>
          revision.articleId === article.id,
      )
      .map((revision) => revision.revisionNumber);

  const revisionNumber =
    existingRevisionNumbers.length > 0
      ? Math.max(...existingRevisionNumbers) + 1
      : 1;

  const revision: ArticleRevision = {
    id: randomUUID(),
    articleId: article.id,
    revisionNumber,

    title: article.title,
    slug: article.slug,
    subtitle: article.subtitle,
    summary: article.summary,

    leadHtml: article.leadHtml,
    contentHtml: article.contentHtml,
    contentJson: cloneValue(article.contentJson),
    plainText: article.plainText,

    status: article.status,
    featured: article.featured,

    toc: cloneValue(article.toc),
    quickFacts: cloneValue(article.quickFacts),

    categoryIds: [...article.categoryIds],
    aliases: [...article.aliases],
    relatedArticleIds: [
      ...article.relatedArticleIds,
    ],

    publishedAt: article.publishedAt,

    changeNote:
      changeNote.trim() ||
      "Actualización del artículo",

    createdAt: new Date().toISOString(),
  };

  database.revisions.push(revision);

  return revision;
}

function updateFeaturedArticle(
  database: WikiDatabase,
  article: Article,
): void {
  const canBeFeatured =
    article.status === "published" &&
    article.featured;

  if (canBeFeatured) {
    for (const candidate of database.articles) {
      if (candidate.id !== article.id) {
        candidate.featured = false;
      }
    }

    database.homepage.featuredArticleId =
      article.id;

    return;
  }

  article.featured = false;

  if (
    database.homepage.featuredArticleId ===
    article.id
  ) {
    database.homepage.featuredArticleId = null;
  }
}

export interface ArticleListOptions {
  status?: ArticleStatus;
  search?: string;
}

export interface ArticlePageData {
  article: Article;
  categories: Category[];
  relatedArticles: Article[];
}

export class LocalWikiRepository {
  async getDatabase(): Promise<WikiDatabase> {
    return cloneValue(await readDatabase());
  }

  async listArticles(
    options: ArticleListOptions = {},
  ): Promise<Article[]> {
    const database = await readDatabase();

    let articles = [...database.articles];

    if (options.status) {
      articles = articles.filter(
        (article) =>
          article.status === options.status,
      );
    }

    if (options.search?.trim()) {
      const normalizedQuery =
        normalizeSearchText(
          options.search.trim(),
        );

      articles = articles.filter((article) => {
        const searchableContent =
          normalizeSearchText(
            [
              article.title,
              article.subtitle,
              article.summary,
              article.plainText,
              ...article.aliases,
            ].join(" "),
          );

        return searchableContent.includes(
          normalizedQuery,
        );
      });
    }

    return cloneValue(
      sortArticlesByUpdatedDate(articles),
    );
  }

  async listCategories(): Promise<Category[]> {
    const database = await readDatabase();

    return cloneValue(
      [...database.categories].sort(
        (firstCategory, secondCategory) =>
          firstCategory.name.localeCompare(
            secondCategory.name,
            "es",
          ),
      ),
    );
  }

  async getArticleById(
    articleId: string,
  ): Promise<Article | null> {
    const database = await readDatabase();

    const article =
      database.articles.find(
        (candidate) =>
          candidate.id === articleId,
      ) ?? null;

    return article ? cloneValue(article) : null;
  }

  async getPublishedArticleBySlug(
    slug: string,
  ): Promise<ArticlePageData | null> {
    const database = await readDatabase();

    const normalizedRequestedSlug =
      normalizeSlug(slug);

    const article =
      database.articles.find(
        (candidate) =>
          candidate.status === "published" &&
          candidate.slug ===
            normalizedRequestedSlug,
      ) ?? null;

    if (!article) {
      return null;
    }

    const categories =
      database.categories.filter((category) =>
        article.categoryIds.includes(category.id),
      );

    const relatedArticles =
      database.articles.filter(
        (candidate) =>
          candidate.status === "published" &&
          article.relatedArticleIds.includes(
            candidate.id,
          ),
      );

    return cloneValue({
      article,
      categories,
      relatedArticles,
    });
  }

  async getHomepageData() {
    const database = await readDatabase();

    const publishedArticles =
      database.articles.filter(
        (article) =>
          article.status === "published",
      );

    const featuredArticle =
      publishedArticles.find(
        (article) =>
          article.id ===
          database.homepage.featuredArticleId,
      ) ??
      publishedArticles.find(
        (article) => article.featured,
      ) ??
      null;

    const recentArticles =
      sortArticlesByUpdatedDate(
        publishedArticles,
      ).slice(
        0,
        database.homepage.recentArticleLimit,
      );

    const popularArticles =
      sortArticlesByPopularity(
        publishedArticles,
      ).slice(
        0,
        database.homepage.popularArticleLimit,
      );

    const visibleCategories =
      database.categories.filter((category) =>
        database.homepage.visibleCategoryIds.includes(
          category.id,
        ),
      );

    return cloneValue({
      settings: database.settings,
      homepage: database.homepage,
      featuredArticle,
      recentArticles,
      popularArticles,
      visibleCategories,
      publishedArticleCount:
        publishedArticles.length,
    });
  }

  async getDashboardData() {
    const database = await readDatabase();

    const publishedArticles =
      database.articles.filter(
        (article) =>
          article.status === "published",
      );

    const draftArticles =
      database.articles.filter(
        (article) =>
          article.status === "draft",
      );

    const archivedArticles =
      database.articles.filter(
        (article) =>
          article.status === "archived",
      );

    const totalViews =
      database.articles.reduce(
        (total, article) =>
          total + article.viewCount,
        0,
      );

    const brokenLinkCount =
      database.articles.reduce(
        (total, article) =>
          total + countBrokenLinks(article),
        0,
      );

    return cloneValue({
      statistics: {
        totalArticles:
          database.articles.length,

        publishedArticles:
          publishedArticles.length,

        draftArticles:
          draftArticles.length,

        archivedArticles:
          archivedArticles.length,

        totalViews,
        brokenLinkCount,

        totalCategories:
          database.categories.length,
      },

      popularArticles:
        sortArticlesByPopularity(
          publishedArticles,
        ).slice(0, 5),

      recentlyUpdatedArticles:
        sortArticlesByUpdatedDate(
          database.articles,
        ).slice(0, 5),
    });
  }

  async createArticle(
    rawInput: ArticleEditorInput,
  ): Promise<Article> {
    const input =
      articleEditorInputSchema.parse(rawInput);

    return mutateDatabase((database) => {
      const now = new Date().toISOString();

      const slug = normalizeSlug(
        input.slug || input.title,
      );

      if (!slug) {
        throw new WikiRepositoryError(
          "INVALID_SLUG",
          "No fue posible generar una dirección válida.",
          400,
        );
      }

      validateUniqueSlug(database, slug);

      const articleId = randomUUID();

      const preparedContent =
        prepareWikiContent(
          input.leadHtml,
          input.contentHtml,
        );

      const categoryIds =
        validateCategoryIds(
          database,
          input.categoryIds,
        );

      const relatedArticleIds =
        validateRelatedArticleIds(
          database,
          articleId,
          input.relatedArticleIds,
        );

      const article: Article = {
        id: articleId,

        title: input.title,
        slug,
        subtitle: input.subtitle,
        summary: input.summary,

        leadHtml: preparedContent.leadHtml,
        contentHtml:
          preparedContent.contentHtml,
        contentJson: cloneValue(
          input.contentJson,
        ),
        plainText: preparedContent.plainText,

        status: input.status,

        featured:
          input.status === "published" &&
          input.featured,

        toc: preparedContent.toc,

        quickFacts: normalizeQuickFacts(
          input.quickFacts,
        ),

        categoryIds,

        aliases: normalizeStringList(
          input.aliases,
        ),

        relatedArticleIds,

        viewCount: 0,

        createdAt: now,
        updatedAt: now,

        publishedAt:
          input.status === "published"
            ? now
            : null,
      };

      database.articles.push(article);

      updateFeaturedArticle(
        database,
        article,
      );

      createRevision(
        database,
        article,
        input.changeNote ||
          "Creación del artículo",
      );

      return cloneValue(article);
    });
  }

  async updateArticle(
    articleId: string,
    rawInput: ArticleEditorInput,
  ): Promise<Article> {
    const input =
      articleEditorInputSchema.parse(rawInput);

    return mutateDatabase((database) => {
      const article = getArticleOrThrow(
        database,
        articleId,
      );

      const slug = normalizeSlug(
        input.slug || input.title,
      );

      if (!slug) {
        throw new WikiRepositoryError(
          "INVALID_SLUG",
          "No fue posible generar una dirección válida.",
          400,
        );
      }

      validateUniqueSlug(
        database,
        slug,
        articleId,
      );

      const preparedContent =
        prepareWikiContent(
          input.leadHtml,
          input.contentHtml,
        );

      const categoryIds =
        validateCategoryIds(
          database,
          input.categoryIds,
        );

      const relatedArticleIds =
        validateRelatedArticleIds(
          database,
          articleId,
          input.relatedArticleIds,
        );

      const now = new Date().toISOString();

      article.title = input.title;
      article.slug = slug;
      article.subtitle = input.subtitle;
      article.summary = input.summary;

      article.leadHtml =
        preparedContent.leadHtml;

      article.contentHtml =
        preparedContent.contentHtml;

      article.contentJson = cloneValue(
        input.contentJson,
      );

      article.plainText =
        preparedContent.plainText;

      article.status = input.status;

      article.featured =
        input.status === "published" &&
        input.featured;

      article.toc = preparedContent.toc;

      article.quickFacts =
        normalizeQuickFacts(
          input.quickFacts,
        );

      article.categoryIds = categoryIds;

      article.aliases =
        normalizeStringList(input.aliases);

      article.relatedArticleIds =
        relatedArticleIds;

      article.updatedAt = now;

      if (
        input.status === "published" &&
        !article.publishedAt
      ) {
        article.publishedAt = now;
      }

      updateFeaturedArticle(
        database,
        article,
      );

      createRevision(
        database,
        article,
        input.changeNote,
      );

      return cloneValue(article);
    });
  }

  async changeArticleStatus(
    articleId: string,
    status: ArticleStatus,
    changeNote = "Cambio de estado",
  ): Promise<Article> {
    const currentArticle =
      await this.getArticleById(articleId);

    if (!currentArticle) {
      throw new WikiRepositoryError(
        "ARTICLE_NOT_FOUND",
        "El artículo solicitado no existe.",
        404,
      );
    }

    return this.updateArticle(articleId, {
      title: currentArticle.title,
      slug: currentArticle.slug,
      subtitle: currentArticle.subtitle,
      summary: currentArticle.summary,

      leadHtml: currentArticle.leadHtml,
      contentHtml: currentArticle.contentHtml,
      contentJson:
        currentArticle.contentJson,

      status,

      featured:
        status === "published"
          ? currentArticle.featured
          : false,

      quickFacts:
        currentArticle.quickFacts,

      categoryIds:
        currentArticle.categoryIds,

      aliases: currentArticle.aliases,

      relatedArticleIds:
        currentArticle.relatedArticleIds,

      changeNote,
    });
  }

  async deleteArticle(
    articleId: string,
  ): Promise<void> {
    await mutateDatabase((database) => {
      const articleIndex =
        database.articles.findIndex(
          (article) =>
            article.id === articleId,
        );

      if (articleIndex === -1) {
        throw new WikiRepositoryError(
          "ARTICLE_NOT_FOUND",
          "El artículo solicitado no existe.",
          404,
        );
      }

      database.articles.splice(
        articleIndex,
        1,
      );

      database.revisions =
        database.revisions.filter(
          (revision) =>
            revision.articleId !== articleId,
        );

      for (const article of database.articles) {
        article.relatedArticleIds =
          article.relatedArticleIds.filter(
            (relatedArticleId) =>
              relatedArticleId !== articleId,
          );
      }

      if (
        database.homepage.featuredArticleId ===
        articleId
      ) {
        database.homepage.featuredArticleId =
          null;
      }
    });
  }

  async listArticleRevisions(
    articleId: string,
  ): Promise<ArticleRevision[]> {
    const database = await readDatabase();

    const articleExists =
      database.articles.some(
        (article) =>
          article.id === articleId,
      );

    if (!articleExists) {
      throw new WikiRepositoryError(
        "ARTICLE_NOT_FOUND",
        "El artículo solicitado no existe.",
        404,
      );
    }

    const revisions =
      database.revisions
        .filter(
          (revision) =>
            revision.articleId === articleId,
        )
        .sort(
          (firstRevision, secondRevision) =>
            secondRevision.revisionNumber -
            firstRevision.revisionNumber,
        );

    return cloneValue(revisions);
  }

  async restoreArticleRevision(
    articleId: string,
    revisionId: string,
  ): Promise<Article> {
    return mutateDatabase((database) => {
      const article = getArticleOrThrow(
        database,
        articleId,
      );

      const revision =
        database.revisions.find(
          (candidate) =>
            candidate.id === revisionId &&
            candidate.articleId === articleId,
        );

      if (!revision) {
        throw new WikiRepositoryError(
          "REVISION_NOT_FOUND",
          "La revisión solicitada no existe.",
          404,
        );
      }

      validateUniqueSlug(
        database,
        revision.slug,
        articleId,
      );

      article.title = revision.title;
      article.slug = revision.slug;
      article.subtitle = revision.subtitle;
      article.summary = revision.summary;

      article.leadHtml = revision.leadHtml;
      article.contentHtml =
        revision.contentHtml;

      article.contentJson = cloneValue(
        revision.contentJson,
      );

      article.plainText = revision.plainText;

      article.status = revision.status;
      article.featured =
        revision.featured;

      article.toc = cloneValue(
        revision.toc,
      );

      article.quickFacts = cloneValue(
        revision.quickFacts,
      );

      article.categoryIds = [
        ...revision.categoryIds,
      ];

      article.aliases = [
        ...revision.aliases,
      ];

      article.relatedArticleIds = [
        ...revision.relatedArticleIds,
      ];

      article.publishedAt =
        revision.publishedAt;

      article.updatedAt =
        new Date().toISOString();

      updateFeaturedArticle(
        database,
        article,
      );

      createRevision(
        database,
        article,
        `Restauración de la revisión ${revision.revisionNumber}`,
      );

      return cloneValue(article);
    });
  }

  async incrementArticleView(
    articleId: string,
  ): Promise<number> {
    return mutateDatabase((database) => {
      const article = getArticleOrThrow(
        database,
        articleId,
      );

      article.viewCount += 1;

      return article.viewCount;
    });
  }
}

export const localWikiRepository =
  new LocalWikiRepository();