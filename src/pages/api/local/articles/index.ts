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

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
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

function isUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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
      ...sanitizeHtml.defaults
        .allowedAttributes,

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
    .single();

  if (profileError) {
    console.error(
      "[articles] No fue posible consultar el perfil:",
      profileError,
    );

    throw new HttpError(
      403,
      "No fue posible verificar tus permisos.",
    );
  }

  if (profile?.role !== "admin") {
    throw new HttpError(
      403,
      "Tu cuenta no tiene permisos de administrador.",
    );
  }

  return user;
}

async function rollbackArticle(
  supabase: SupabaseServerClient,
  articleId: string,
): Promise<void> {
  const {
    error,
  } = await supabase
    .from("articles")
    .delete()
    .eq("id", articleId);

  if (error) {
    console.error(
      "[POST /api/local/articles] No fue posible revertir el artículo:",
      error,
    );
  }
}

function mapArticleRow(
  row: Record<string, any>,
  extra?: {
    aliases?: string[];
    categoryIds?: string[];
    relatedArticleIds?: string[];
    contentJson?: unknown;
    changeNote?: string;
  },
) {
  return {
    id: row.id,
    title: row.title,
    subtitle:
      row.subtitle ?? "",
    slug: row.slug,
    summary:
      row.summary ?? "",
    status: row.status,

    languageCode:
      row.language_code ?? "es",

    leadHtml:
      row.lead_html ?? "",

    contentHtml:
      row.content_html ?? "",

    contentJson:
      extra?.contentJson ?? null,

    quickFacts:
      row.quick_facts ??
      defaultQuickFacts,

    featured:
      row.is_featured === true,

    featuredOrder:
      row.featured_order ?? null,

    aliases:
      extra?.aliases ?? [],

    categoryIds:
      extra?.categoryIds ?? [],

    relatedArticleIds:
      extra?.relatedArticleIds ??
      [],

    changeNote:
      extra?.changeNote ?? "",

    publishedAt:
      row.published_at ?? null,

    archivedAt:
      row.archived_at ?? null,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,

    viewCount: 0,
  };
}

function handleError(
  route: string,
  error: unknown,
): Response {
  console.error(
    `[${route}]`,
    error,
  );

  if (error instanceof HttpError) {
    return jsonResponse(
      {
        error: error.message,
      },
      error.status,
    );
  }

  const message =
    error instanceof Error
      ? error.message
      : "Ocurrió un error inesperado.";

  return jsonResponse(
    {
      error: message,
    },
    500,
  );
}

/**
 * Lista los artículos desde Supabase.
 */
export const GET: APIRoute = async ({
  request,
  cookies,
  url,
}) => {
  try {
    const supabase =
      createSupabaseServerClient({
        request,
        cookies,
      });

    await requireAdmin(
      supabase,
    );

    const requestedStatus =
      url.searchParams.get("status");

    const search =
      url.searchParams
        .get("search")
        ?.trim();

    const status =
      requestedStatus &&
      validStatuses.includes(
        requestedStatus as ArticleStatus,
      )
        ? (
            requestedStatus as ArticleStatus
          )
        : undefined;

    let query = supabase
      .from("articles")
      .select(
        `
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
        `,
        {
          count: "exact",
        },
      )
      .order(
        "updated_at",
        {
          ascending: false,
        },
      );

    if (status) {
      query = query.eq(
        "status",
        status,
      );
    }

    if (search) {
      query = query.textSearch(
        "search_vector",
        search,
        {
          type: "websearch",
          config: "spanish",
        },
      );
    }

    const {
      data,
      error,
      count,
    } = await query;

    if (error) {
      console.error(
        "[GET /api/local/articles] Supabase:",
        error,
      );

      throw new HttpError(
        500,
        `No fue posible consultar los artículos: ${error.message}`,
      );
    }

    const articles = (
      data ?? []
    ).map((row) =>
      mapArticleRow(row),
    );

    return jsonResponse({
      data: articles,
      total:
        count ?? articles.length,
    });
  } catch (error) {
    return handleError(
      "GET /api/local/articles",
      error,
    );
  }
};

/**
 * Crea el artículo en Supabase usando
 * la sesión autenticada del administrador.
 */
export const POST: APIRoute = async ({
  request,
  cookies,
}) => {
  let createdArticleId:
    | string
    | null = null;

  let supabase:
    | SupabaseServerClient
    | null = null;

  try {
    supabase =
      createSupabaseServerClient({
        request,
        cookies,
      });

    const user =
      await requireAdmin(
        supabase,
      );

    const body =
      (
        await readJsonRequest(
          request,
        )
      ) as Partial<ArticleEditorInput>;

    const title =
      typeof body.title === "string"
        ? body.title.trim()
        : "";

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

    const rawSlug =
      typeof body.slug === "string" &&
      body.slug.trim()
        ? body.slug
        : title;

    const slug =
      normalizeSlug(rawSlug);

    if (!slug) {
      throw new HttpError(
        400,
        "No fue posible generar un slug válido.",
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

    const requestedStatus =
      body.status;

    const status =
      requestedStatus &&
      validStatuses.includes(
        requestedStatus,
      )
        ? requestedStatus
        : "draft";

    const subtitle =
      typeof body.subtitle ===
        "string"
        ? body.subtitle.trim()
        : "";

    const summary =
      typeof body.summary ===
        "string"
        ? body.summary.trim()
        : "";

    const quickFacts =
      isRecord(
        body.quickFacts,
      )
        ? body.quickFacts
        : defaultQuickFacts;

    const leadHtml =
      sanitizeArticleHtml(
        body.leadHtml,
      );

    const contentHtml =
      sanitizeArticleHtml(
        body.contentHtml,
      );

    const {
      data: articleRow,
      error: articleError,
    } = await supabase
      .from("articles")
      .insert({
        title,
        subtitle:
          subtitle || null,
        slug,
        summary,
        status,
        language_code: "es",
        lead_html: leadHtml,
        content_html:
          contentHtml,
        quick_facts:
          quickFacts,
        is_featured:
          body.featured === true,
        featured_order: null,
      })
      .select(
        `
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
        `,
      )
      .single();

    if (articleError) {
      console.error(
        "[POST /api/local/articles] Error creando artículo:",
        articleError,
      );

      if (
        articleError.code ===
        "23505"
      ) {
        throw new HttpError(
          409,
          "Ya existe un artículo con ese slug.",
        );
      }

      if (
        articleError.code ===
        "23514"
      ) {
        throw new HttpError(
          400,
          `El artículo contiene un valor inválido: ${articleError.message}`,
        );
      }

      if (
        articleError.code ===
        "42501"
      ) {
        throw new HttpError(
          403,
          "Supabase rechazó la operación por falta de permisos.",
        );
      }

      throw new HttpError(
        500,
        `No fue posible crear el artículo: ${articleError.message}`,
      );
    }

    if (!articleRow) {
      throw new HttpError(
        500,
        "Supabase no devolvió el artículo creado.",
      );
    }

    createdArticleId =
      articleRow.id;

    /*
     * Categorías.
     *
     * Por ahora solo se aceptan UUID válidos
     * que ya existan en Supabase.
     */
    const categoryIds =
      getStringArray(
        body.categoryIds,
      ).filter(isUuid);

    if (
      categoryIds.length > 0
    ) {
      const {
        error: categoryError,
      } = await supabase
        .from(
          "article_categories",
        )
        .insert(
          categoryIds.map(
            (categoryId) => ({
              article_id:
                articleRow.id,

              category_id:
                categoryId,
            }),
          ),
        );

      if (categoryError) {
        throw new HttpError(
          400,
          `No fue posible asignar las categorías: ${categoryError.message}`,
        );
      }
    }

    /*
     * Alias del artículo.
     *
     * Cada alias se normaliza como slug
     * y se guarda como redirección.
     */
    const aliases = [
      ...new Set(
        getStringArray(
          body.aliases,
        )
          .map(normalizeSlug)
          .filter(
            (alias) =>
              alias &&
              alias !== slug,
          ),
      ),
    ];

    if (
      aliases.length > 0
    ) {
      const {
        error: aliasError,
      } = await supabase
        .from(
          "article_redirects",
        )
        .insert(
          aliases.map(
            (alias) => ({
              old_slug: alias,

              article_id:
                articleRow.id,

              reason: "alias",
              is_active: true,
              created_by:
                user.id,
            }),
          ),
        );

      if (aliasError) {
        throw new HttpError(
          400,
          `No fue posible guardar los alias: ${aliasError.message}`,
        );
      }
    }

    /*
     * Artículos relacionados.
     */
    const relatedArticleIds =
      getStringArray(
        body.relatedArticleIds,
      )
        .filter(isUuid)
        .filter(
          (articleId) =>
            articleId !==
            articleRow.id,
        );

    if (
      relatedArticleIds.length >
      0
    ) {
      const {
        error: relationError,
      } = await supabase
        .from(
          "article_relations",
        )
        .insert(
          relatedArticleIds.map(
            (
              relatedArticleId,
              index,
            ) => ({
              source_article_id:
                articleRow.id,

              target_article_id:
                relatedArticleId,

              relation_type:
                "related",

              sort_order: index,

              created_by:
                user.id,
            }),
          ),
        );

      if (relationError) {
        throw new HttpError(
          400,
          `No fue posible guardar los artículos relacionados: ${relationError.message}`,
        );
      }
    }

    const article =
      mapArticleRow(
        articleRow,
        {
          aliases,
          categoryIds,
          relatedArticleIds,

          contentJson:
            body.contentJson ??
            null,

          changeNote:
            typeof body.changeNote ===
              "string"
              ? body.changeNote
              : "Creación del artículo",
        },
      );

    return jsonResponse(
      {
        data: article,

        message:
          "El artículo fue creado correctamente en Supabase.",
      },
      201,
    );
  } catch (error) {
    /*
     * Si falló una relación secundaria,
     * eliminamos el artículo para no dejar
     * un registro creado a medias.
     */
    if (
      supabase &&
      createdArticleId
    ) {
      await rollbackArticle(
        supabase,
        createdArticleId,
      );
    }

    return handleError(
      "POST /api/local/articles",
      error,
    );
  }
};