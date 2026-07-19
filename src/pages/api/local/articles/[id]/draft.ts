import type { APIRoute } from "astro";

import {
  ApiRequestError,
  apiErrorResponse,
  jsonResponse,
} from "../../../../../lib/wiki/api-response";

import {
  localWikiRepository,
} from "../../../../../lib/wiki/local-wiki-repository";

export const prerender = false;

export const POST: APIRoute = async ({ params }) => {
  try {
    const articleId = params.id;

    if (!articleId) {
      throw new ApiRequestError(
        "No se proporcionó el identificador del artículo.",
      );
    }

    const article =
      await localWikiRepository.changeArticleStatus(
        articleId,
        "draft",
        "Regreso del artículo a borrador",
      );

    return jsonResponse({
      data: article,
      message: "El artículo volvió al estado de borrador.",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
};