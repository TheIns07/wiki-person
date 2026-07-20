import type { APIRoute } from "astro";

import type {
  ArticleEditorInput,
} from "../../../../lib/wiki/article-input";

import {
  apiErrorResponse,
  jsonResponse,
  readJsonRequest,
} from "../../../../lib/wiki/api-response";

import type {
  ArticleStatus,
} from "../../../../types/wiki";

export const prerender = false;

const validStatuses: ArticleStatus[] = [
  "draft",
  "published",
  "archived",
];

/**
 * La importación dinámica permite capturar errores ocurridos
 * al cargar local-wiki-repository y sus dependencias.
 */
async function getLocalWikiRepository() {
  const module = await import(
    "../../../../lib/wiki/local-wiki-repository"
  );

  return module.localWikiRepository;
}

function logApiError(
  route: string,
  error: unknown,
): void {
  console.error(
    `[${route}] Error`,
    error,
  );

  if (error instanceof Error) {
    console.error(
      `[${route}] Mensaje:`,
      error.message,
    );

    if (error.stack) {
      console.error(
        `[${route}] Stack:`,
        error.stack,
      );
    }
  }
}

export const GET: APIRoute = async ({
  url,
}) => {
  console.log(
    "[GET /api/local/articles] Solicitud recibida",
  );

  try {
    const requestedStatus =
      url.searchParams.get("status");

    const search =
      url.searchParams.get("search") ??
      undefined;

    const status =
      requestedStatus &&
      validStatuses.includes(
        requestedStatus as ArticleStatus,
      )
        ? (requestedStatus as ArticleStatus)
        : undefined;

    const localWikiRepository =
      await getLocalWikiRepository();

    const articles =
      await localWikiRepository.listArticles({
        status,
        search,
      });

    console.log(
      "[GET /api/local/articles] Consulta completada",
      {
        status: status ?? "all",
        search: search ?? null,
        total: articles.length,
      },
    );

    return jsonResponse({
      data: articles,
      total: articles.length,
    });
  } catch (error) {
    console.error(
      "[GET /api/local/articles]",
      error,
    );
  
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al consultar los artículos.";
  
    return jsonResponse(
      {
        error: message,
      },
      500,
    );
  }
};

export const POST: APIRoute = async ({
  request,
}) => {
  console.log(
    "[POST /api/local/articles] Solicitud recibida",
  );

  try {
    const body =
      await readJsonRequest(request);

    const articleInput =
      body as ArticleEditorInput;

    console.log(
      "[POST /api/local/articles] Datos recibidos",
      {
        title:
          typeof articleInput.title ===
          "string"
            ? articleInput.title
            : null,

        slug:
          typeof articleInput.slug ===
          "string"
            ? articleInput.slug
            : null,

        status:
          typeof articleInput.status ===
          "string"
            ? articleInput.status
            : null,
      },
    );

    const localWikiRepository =
      await getLocalWikiRepository();

    const article =
      await localWikiRepository.createArticle(
        articleInput,
      );

    console.log(
      "[POST /api/local/articles] Artículo creado",
      {
        id: article.id,
        slug: article.slug,
        status: article.status,
      },
    );

    return jsonResponse(
      {
        data: article,
        message:
          "El artículo fue creado correctamente.",
      },
      201,
    );
  } catch (error) {
    console.error(
      "[POST /api/local/articles]",
      error,
    );
  
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al guardar.";
  
    return jsonResponse(
      {
        error: message,
      },
      500,
    );
  }
};