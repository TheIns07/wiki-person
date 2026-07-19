import type { APIRoute } from "astro";

import type {
  ArticleEditorInput,
} from "../../../../lib/wiki/article-input";

import {
  ApiRequestError,
  apiErrorResponse,
  jsonResponse,
  readJsonRequest,
} from "../../../../lib/wiki/api-response";

import {
  localWikiRepository,
} from "../../../../lib/wiki/local-wiki-repository";

export const prerender = false;

function requireArticleId(
  articleId: string | undefined,
): string {
  if (!articleId) {
    throw new ApiRequestError(
      "No se proporcionó el identificador del artículo.",
      400,
    );
  }

  return articleId;
}

export const GET: APIRoute = async ({ params }) => {
  try {
    const articleId = requireArticleId(params.id);

    const article =
      await localWikiRepository.getArticleById(
        articleId,
      );

    if (!article) {
      return jsonResponse(
        {
          error: "El artículo solicitado no existe.",
        },
        404,
      );
    }

    return jsonResponse({
      data: article,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const PATCH: APIRoute = async ({
  params,
  request,
}) => {
  try {
    const articleId = requireArticleId(params.id);
    const body = await readJsonRequest(request);

    const article =
      await localWikiRepository.updateArticle(
        articleId,
        body as ArticleEditorInput,
      );

    return jsonResponse({
      data: article,
      message:
        "Los cambios del artículo fueron guardados.",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const articleId = requireArticleId(params.id);

    await localWikiRepository.deleteArticle(
      articleId,
    );

    return jsonResponse({
      message:
        "El artículo y sus revisiones fueron eliminados.",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
};