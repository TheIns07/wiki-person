import type { APIRoute } from "astro";
import sanitizeHtml from "sanitize-html";

import type {
  ArticleEditorInput,
} from "../../../../lib/wiki/article-input";

import {
  jsonResponse,
  readJsonRequest,
} from "../../../../lib/wiki/api-response";

import {
  createSupabaseServerClient,
} from "../../../../lib/supabase/server";

import type {
  ArticleStatus,
} from "../../../../types/wiki";

export const prerender = false;

const validStatuses: ArticleStatus[] = [
  "draft",
  "published",
  "archived",
];

const defaultQuickFacts = {
  enabled: false,
  title: "Datos rápidos",
  summary: "",
  defaultOpen: false,
  sections: [],
};

type SupabaseServerClient =
  ReturnType<typeof createSupabaseServerClient>;

type ArticleRow = {
  id: string;
  title: string;
  subtitle: string | null;
  slug: string;
  summary: string | null;
  status: ArticleStatus;
  language_code: string | null;
  lead_html: string | null;
  content_html: string | null;
  quick_facts: unknown;
  is_featured: boolean;
  featured_order: number | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

class HttpError extends Error {
  status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function requireArticleId(
  articleId: string | undefined,
): string {
  if (!articleId) {
    throw new HttpError(
      400,
      "No se proporcionó el identificador del artículo.",
    );
  }

  if (!isUuid(articleId)) {
    throw new HttpError(
      400,
      "El identificador del artículo no es válido.",
    );
  }

  return articleId;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function hasOwnProperty(
  value: object,
  property: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(
    value,
    property,
  );
}

function isUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeSlug(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeStatus(
  value: unknown,
): ArticleStatus {
  if (
    value === "draft" ||
    value === "published" ||
    value === "archived"
  ) {
    return value;
  }

  return "draft";
}

function getStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter(
          (
            item,
          ): item is string =>
            typeof item === "string",
        )
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function sanitizeArticleHtml(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return "";
  }

  return sanitizeHtml(value, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "figure",
      "figcaption",
      "img",
    ],

    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,

      "*": [
        "id",
      ],

      a: [
        "href",
        "name",
        "target",
        "rel",
        "title",
      ],

      img: [
        "src",
        "alt",
        "title",
        "width",
        "height",
        "loading",
      ],
    },

    allowedSchemes: [
      "http",
      "https",
      "mailto",
    ],
  });
}

function htmlToPlainText(
  value: string,
): string {
  return value
    .replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/gi,
      " ",
    )
    .replace(
      /<style\b[^>]*>[\s\S]*?<\/style>/gi,
      " ",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function createHeadingId(
  label: string,
  index: number,
): string {
  const normalized = normalizeSlug(label);

  return (
    normalized ||
    `seccion-${index + 1}`
  );
}

function extractToc(
  html: string,
) {
  const toc: Array<{
    id: string;
    label: string;
    level: 2 | 3 | 4;
  }> = [];

  const headingPattern =
    /<h([2-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;

  let match:
    | RegExpExecArray
    | null;

  while (
    (
      match =
        headingPattern.exec(html)
    ) !== null
  ) {
    const level =
      Number(match[1]) as
        | 2
        | 3
        | 4;

    const attributes =
      match[2] ?? "";

    const label =
      htmlToPlainText(
        match[3] ?? "",
      );

    if (!label) {
      continue;
    }

    const idMatch =
      attributes.match(
        /\bid=["']([^"']+)["']/i,
      );

    toc.push({
      id:
        idMatch?.[1] ??
        createHeadingId(
          label,
          toc.length,
        ),

      label,
      level,
    });
  }

  return toc;
}

async function requireAdmin(
  supabase: SupabaseServerClient,
) {
  const {
    data: {
      user,
    },
    error: userError,
  } = await supabase.auth.getUser();

  if (
    userError ||
    !user
  ) {
    throw new HttpError(
      401,
      "Tu sesión expiró. Inicia sesión nuevamente.",
    );
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error(
      "[api/local/articles/[id]] Error consultando perfil:",
      profileError,
    );

    throw new HttpError(
      403,
      "No fue posible verificar tus permisos.",
    );
  }

  if (
    profile?.role !== "admin"
  ) {
    throw new HttpError(
      403,
      "Tu cuenta no tiene permisos de administrador.",
    );
  }

  return user;
}

async function getArticleRow(
  supabase: SupabaseServerClient,
  articleId: string,
): Promise<ArticleRow | null> {
  const {
    data,
    error,
  } = await supabase
    .from("articles")
    .select(`
      id,
      title,
      subtitle,
      slug,
      summary,
      status,
      language_code,
      lead_html,
      content_html,
      quick_facts,
      is_featured,
      featured_order,
      published_at,
      archived_at,
      created_at,
      updated_at
    `)
    .eq("id", articleId)
    .maybeSingle();

  if (error) {
    throw new HttpError(
      500,
      `No fue posible consultar el artículo: ${error.message}`,
    );
  }

  return data as ArticleRow | null;
}

async function getArticleResponse(
  supabase: SupabaseServerClient,
  articleId: string,
  changeNote = "",
  contentJson: unknown = null,
) {
  const articleRow =
    await getArticleRow(
      supabase,
      articleId,
    );

  if (!articleRow) {
    return null;
  }

  const [
    categoryResult,
    aliasResult,
    relationResult,
    statsResult,
  ] = await Promise.all([
    supabase
      .from("article_categories")
      .select("category_id")
      .eq(
        "article_id",
        articleId,
      ),

    supabase
      .from("article_redirects")
      .select("old_slug")
      .eq(
        "article_id",
        articleId,
      )
      .eq(
        "reason",
        "alias",
      )
      .eq(
        "is_active",
        true,
      )
      .order(
        "created_at",
        {
          ascending: true,
        },
      ),

    supabase
      .from("article_relations")
      .select("target_article_id")
      .eq(
        "source_article_id",
        articleId,
      )
      .eq(
        "relation_type",
        "related",
      )
      .order(
        "sort_order",
        {
          ascending: true,
        },
      ),

    supabase
      .from("article_stats")
      .select("view_count")
      .eq(
        "article_id",
        articleId,
      )
      .maybeSingle(),
  ]);

  if (categoryResult.error) {
    throw new HttpError(
      500,
      `No fue posible cargar las categorías: ${categoryResult.error.message}`,
    );
  }

  if (aliasResult.error) {
    throw new HttpError(
      500,
      `No fue posible cargar los alias: ${aliasResult.error.message}`,
    );
  }

  if (relationResult.error) {
    throw new HttpError(
      500,
      `No fue posible cargar los artículos relacionados: ${relationResult.error.message}`,
    );
  }

  if (statsResult.error) {
    throw new HttpError(
      500,
      `No fue posible cargar las estadísticas: ${statsResult.error.message}`,
    );
  }

  const leadHtml =
    articleRow.lead_html ?? "";

  const contentHtml =
    articleRow.content_html ?? "";

  return {
    id: articleRow.id,
    title: articleRow.title,

    subtitle:
      articleRow.subtitle ?? "",

    slug: articleRow.slug,

    summary:
      articleRow.summary ?? "",

    status:
      normalizeStatus(
        articleRow.status,
      ),

    languageCode:
      articleRow.language_code ??
      "es",

    leadHtml,
    contentHtml,
    contentJson,

    plainText:
      htmlToPlainText(
        `${leadHtml} ${contentHtml}`,
      ),

    toc:
      extractToc(
        contentHtml,
      ),

    quickFacts:
      isRecord(
        articleRow.quick_facts,
      )
        ? articleRow.quick_facts
        : defaultQuickFacts,

    featured:
      articleRow.is_featured ===
      true,

    featuredOrder:
      articleRow.featured_order ??
      null,

    aliases:
      (
        aliasResult.data ?? []
      ).map(
        (item) =>
          item.old_slug,
      ),

    categoryIds:
      (
        categoryResult.data ?? []
      ).map(
        (item) =>
          item.category_id,
      ),

    relatedArticleIds:
      (
        relationResult.data ?? []
      ).map(
        (item) =>
          item.target_article_id,
      ),

    changeNote,

    viewCount:
      Number(
        statsResult.data
          ?.view_count ?? 0,
      ),

    publishedAt:
      articleRow.published_at ??
      null,

    archivedAt:
      articleRow.archived_at ??
      null,

    createdAt:
      articleRow.created_at,

    updatedAt:
      articleRow.updated_at,
  };
}

async function replaceCategories(
  supabase: SupabaseServerClient,
  articleId: string,
  categoryIds: string[],
): Promise<void> {
  const {
    error: deleteError,
  } = await supabase
    .from("article_categories")
    .delete()
    .eq(
      "article_id",
      articleId,
    );

  if (deleteError) {
    throw new HttpError(
      500,
      `No fue posible actualizar las categorías: ${deleteError.message}`,
    );
  }

  if (
    categoryIds.length === 0
  ) {
    return;
  }

  const {
    data: validCategories,
    error: validationError,
  } = await supabase
    .from("categories")
    .select("id")
    .in(
      "id",
      categoryIds,
    );

  if (validationError) {
    throw new HttpError(
      500,
      `No fue posible verificar las categorías: ${validationError.message}`,
    );
  }

  const validCategoryIds =
    new Set(
      (
        validCategories ?? []
      ).map(
        (category) =>
          category.id,
      ),
    );

  const missingCategories =
    categoryIds.filter(
      (categoryId) =>
        !validCategoryIds.has(
          categoryId,
        ),
    );

  if (
    missingCategories.length > 0
  ) {
    throw new HttpError(
      400,
      "Una o más categorías seleccionadas no existen.",
    );
  }

  const {
    error: insertError,
  } = await supabase
    .from("article_categories")
    .insert(
      categoryIds.map(
        (categoryId) => ({
          article_id:
            articleId,

          category_id:
            categoryId,
        }),
      ),
    );

  if (insertError) {
    throw new HttpError(
      500,
      `No fue posible guardar las categorías: ${insertError.message}`,
    );
  }
}

async function replaceAliases(
  supabase: SupabaseServerClient,
  articleId: string,
  aliases: string[],
  currentSlug: string,
  userId: string,
): Promise<string[]> {
  const normalizedAliases = [
    ...new Set(
      aliases
        .map(normalizeSlug)
        .filter(
          (alias) =>
            alias &&
            alias !== currentSlug,
        ),
    ),
  ];

  const {
    error: deleteError,
  } = await supabase
    .from("article_redirects")
    .delete()
    .eq(
      "article_id",
      articleId,
    )
    .eq(
      "reason",
      "alias",
    );

  if (deleteError) {
    throw new HttpError(
      500,
      `No fue posible actualizar los alias: ${deleteError.message}`,
    );
  }

  if (
    normalizedAliases.length === 0
  ) {
    return [];
  }

  const {
    error: insertError,
  } = await supabase
    .from("article_redirects")
    .insert(
      normalizedAliases.map(
        (alias) => ({
          old_slug:
            alias,

          article_id:
            articleId,

          reason:
            "alias",

          is_active:
            true,

          created_by:
            userId,
        }),
      ),
    );

  if (insertError) {
    if (
      insertError.code ===
      "23505"
    ) {
      throw new HttpError(
        409,
        "Uno de los alias ya está siendo utilizado.",
      );
    }

    throw new HttpError(
      500,
      `No fue posible guardar los alias: ${insertError.message}`,
    );
  }

  return normalizedAliases;
}

async function replaceRelations(
  supabase: SupabaseServerClient,
  articleId: string,
  relatedArticleIds: string[],
  userId: string,
): Promise<void> {
  const {
    error: deleteError,
  } = await supabase
    .from("article_relations")
    .delete()
    .eq(
      "source_article_id",
      articleId,
    )
    .eq(
      "relation_type",
      "related",
    );

  if (deleteError) {
    throw new HttpError(
      500,
      `No fue posible actualizar las relaciones: ${deleteError.message}`,
    );
  }

  if (
    relatedArticleIds.length === 0
  ) {
    return;
  }

  const {
    data: validArticles,
    error: validationError,
  } = await supabase
    .from("articles")
    .select("id")
    .in(
      "id",
      relatedArticleIds,
    );

  if (validationError) {
    throw new HttpError(
      500,
      `No fue posible verificar los artículos relacionados: ${validationError.message}`,
    );
  }

  const validArticleIds =
    new Set(
      (
        validArticles ?? []
      ).map(
        (article) =>
          article.id,
      ),
    );

  const missingArticles =
    relatedArticleIds.filter(
      (relatedArticleId) =>
        !validArticleIds.has(
          relatedArticleId,
        ),
    );

  if (
    missingArticles.length > 0
  ) {
    throw new HttpError(
      400,
      "Uno o más artículos relacionados no existen.",
    );
  }

  const {
    error: insertError,
  } = await supabase
    .from("article_relations")
    .insert(
      relatedArticleIds.map(
        (
          relatedArticleId,
          index,
        ) => ({
          source_article_id:
            articleId,

          target_article_id:
            relatedArticleId,

          relation_type:
            "related",

          sort_order:
            index,

          created_by:
            userId,
        }),
      ),
    );

  if (insertError) {
    throw new HttpError(
      500,
      `No fue posible guardar los artículos relacionados: ${insertError.message}`,
    );
  }
}

function handleError(
  route: string,
  error: unknown,
): Response {
  console.error(
    `[${route}]`,
    error,
  );

  if (
    error instanceof HttpError
  ) {
    return jsonResponse(
      {
        error:
          error.message,
      },
      error.status,
    );
  }

  return jsonResponse(
    {
      error:
        error instanceof Error
          ? error.message
          : "Ocurrió un error inesperado.",
    },
    500,
  );
}

export const GET: APIRoute = async ({
  params,
  request,
  cookies,
}) => {
  try {
    const articleId =
      requireArticleId(
        params.id,
      );

    const supabase =
      createSupabaseServerClient({
        request,
        cookies,
      });

    await requireAdmin(
      supabase,
    );

    const article =
      await getArticleResponse(
        supabase,
        articleId,
      );

    if (!article) {
      throw new HttpError(
        404,
        "El artículo solicitado no existe.",
      );
    }

    return jsonResponse({
      data: article,
    });
  } catch (error) {
    return handleError(
      "GET /api/local/articles/[id]",
      error,
    );
  }
};

export const PATCH: APIRoute = async ({
  params,
  request,
  cookies,
}) => {
  try {
    const articleId =
      requireArticleId(
        params.id,
      );

    const supabase =
      createSupabaseServerClient({
        request,
        cookies,
      });

    const user =
      await requireAdmin(
        supabase,
      );

    const currentArticle =
      await getArticleRow(
        supabase,
        articleId,
      );

    if (!currentArticle) {
      throw new HttpError(
        404,
        "El artículo solicitado no existe.",
      );
    }

    const body =
      (
        await readJsonRequest(
          request,
        )
      ) as Partial<ArticleEditorInput>;

    const title =
      typeof body.title ===
        "string"
        ? body.title.trim()
        : currentArticle.title;

    if (!title) {
      throw new HttpError(
        400,
        "El título es obligatorio.",
      );
    }

    if (
      title.length > 200
    ) {
      throw new HttpError(
        400,
        "El título no puede exceder 200 caracteres.",
      );
    }

    const slug =
      hasOwnProperty(
        body,
        "slug",
      )
        ? normalizeSlug(
            typeof body.slug ===
              "string"
              ? body.slug
              : "",
          )
        : currentArticle.slug;

    if (!slug) {
      throw new HttpError(
        400,
        "El slug es obligatorio.",
      );
    }

    if (
      slug.length > 220
    ) {
      throw new HttpError(
        400,
        "El slug no puede exceder 220 caracteres.",
      );
    }

    const status =
      hasOwnProperty(
        body,
        "status",
      )
        ? normalizeStatus(
            body.status,
          )
        : normalizeStatus(
            currentArticle.status,
          );

    if (
      hasOwnProperty(
        body,
        "status",
      ) &&
      !validStatuses.includes(
        status,
      )
    ) {
      throw new HttpError(
        400,
        "El estado del artículo no es válido.",
      );
    }

    const subtitle =
      typeof body.subtitle ===
        "string"
        ? body.subtitle.trim()
        : (
            currentArticle.subtitle ??
            ""
          );

    const summary =
      typeof body.summary ===
        "string"
        ? body.summary.trim()
        : (
            currentArticle.summary ??
            ""
          );

    const leadHtml =
      hasOwnProperty(
        body,
        "leadHtml",
      )
        ? sanitizeArticleHtml(
            body.leadHtml,
          )
        : (
            currentArticle.lead_html ??
            ""
          );

    const contentHtml =
      hasOwnProperty(
        body,
        "contentHtml",
      )
        ? sanitizeArticleHtml(
            body.contentHtml,
          )
        : (
            currentArticle.content_html ??
            ""
          );

    const quickFacts =
      hasOwnProperty(
        body,
        "quickFacts",
      )
        ? (
            isRecord(
              body.quickFacts,
            )
              ? body.quickFacts
              : defaultQuickFacts
          )
        : (
            isRecord(
              currentArticle.quick_facts,
            )
              ? currentArticle.quick_facts
              : defaultQuickFacts
          );

    const featured =
      typeof body.featured ===
        "boolean"
        ? body.featured
        : currentArticle.is_featured;

    const {
      error: updateError,
    } = await supabase
      .from("articles")
      .update({
        title,

        subtitle:
          subtitle || null,

        slug,

        summary,

        status,

        lead_html:
          leadHtml,

        content_html:
          contentHtml,

        quick_facts:
          quickFacts,

        is_featured:
          featured,
      })
      .eq(
        "id",
        articleId,
      );

    if (updateError) {
      if (
        updateError.code ===
        "23505"
      ) {
        throw new HttpError(
          409,
          "Ya existe otro artículo con ese slug.",
        );
      }

      if (
        updateError.code ===
        "23514"
      ) {
        throw new HttpError(
          400,
          `El artículo contiene un valor inválido: ${updateError.message}`,
        );
      }

      if (
        updateError.code ===
        "42501"
      ) {
        throw new HttpError(
          403,
          "Supabase rechazó la actualización por falta de permisos.",
        );
      }

      throw new HttpError(
        500,
        `No fue posible actualizar el artículo: ${updateError.message}`,
      );
    }

    if (
      hasOwnProperty(
        body,
        "categoryIds",
      )
    ) {
      const categoryIds =
        getStringArray(
          body.categoryIds,
        ).filter(isUuid);

      await replaceCategories(
        supabase,
        articleId,
        categoryIds,
      );
    }

    if (
      hasOwnProperty(
        body,
        "aliases",
      )
    ) {
      await replaceAliases(
        supabase,
        articleId,
        getStringArray(
          body.aliases,
        ),
        slug,
        user.id,
      );
    }

    if (
      hasOwnProperty(
        body,
        "relatedArticleIds",
      )
    ) {
      const relatedArticleIds =
        getStringArray(
          body.relatedArticleIds,
        )
          .filter(isUuid)
          .filter(
            (relatedArticleId) =>
              relatedArticleId !==
              articleId,
          );

      await replaceRelations(
        supabase,
        articleId,
        relatedArticleIds,
        user.id,
      );
    }

    const article =
      await getArticleResponse(
        supabase,
        articleId,

        typeof body.changeNote ===
          "string"
          ? body.changeNote
          : "Actualización del artículo",

        body.contentJson ??
          null,
      );

    if (!article) {
      throw new HttpError(
        404,
        "El artículo actualizado ya no existe.",
      );
    }

    return jsonResponse({
      data: article,

      message:
        "Los cambios del artículo fueron guardados.",
    });
  } catch (error) {
    return handleError(
      "PATCH /api/local/articles/[id]",
      error,
    );
  }
};

export const DELETE: APIRoute = async ({
  params,
  request,
  cookies,
}) => {
  try {
    const articleId =
      requireArticleId(
        params.id,
      );

    const supabase =
      createSupabaseServerClient({
        request,
        cookies,
      });

    await requireAdmin(
      supabase,
    );

    const existingArticle =
      await getArticleRow(
        supabase,
        articleId,
      );

    if (!existingArticle) {
      throw new HttpError(
        404,
        "El artículo solicitado no existe.",
      );
    }

    const {
      data: deletedArticle,
      error: deleteError,
    } = await supabase
      .from("articles")
      .delete()
      .eq(
        "id",
        articleId,
      )
      .select("id")
      .maybeSingle();

    if (deleteError) {
      if (
        deleteError.code ===
        "42501"
      ) {
        throw new HttpError(
          403,
          "Supabase rechazó la eliminación por falta de permisos.",
        );
      }

      throw new HttpError(
        500,
        `No fue posible eliminar el artículo: ${deleteError.message}`,
      );
    }

    if (!deletedArticle) {
      throw new HttpError(
        404,
        "El artículo solicitado no existe o no pudo eliminarse.",
      );
    }

    return jsonResponse({
      message:
        "El artículo y sus datos relacionados fueron eliminados.",
    });
  } catch (error) {
    return handleError(
      "DELETE /api/local/articles/[id]",
      error,
    );
  }
};