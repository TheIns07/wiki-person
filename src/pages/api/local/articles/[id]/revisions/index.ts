import type { APIRoute } from "astro";

import {
  ApiRequestError,
  apiErrorResponse,
  jsonResponse,
} from "../../../../../../lib/wiki/api-response";

import {
  localWikiRepository,
} from "../../../../../../lib/wiki/local-wiki-repository";

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const articleId = params.id;

    if (!articleId) {
      throw new ApiRequestError(
        "No se proporcionó el identificador del artículo.",
      );
    }

    const revisions =
      await localWikiRepository.listArticleRevisions(
        articleId,
      );

    return jsonResponse({
      data: revisions,
      total: revisions.length,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
};