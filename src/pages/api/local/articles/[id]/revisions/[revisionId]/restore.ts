import type { APIRoute } from "astro";

import {
  ApiRequestError,
  apiErrorResponse,
  jsonResponse,
} from "../../../../../../../lib/wiki/api-response";

import {
  localWikiRepository,
} from "../../../../../../../lib/wiki/local-wiki-repository";

export const prerender = false;

export const POST: APIRoute = async ({ params }) => {
  try {
    const articleId = params.id;
    const revisionId = params.revisionId;

    if (!articleId) {
      throw new ApiRequestError(
        "No se proporcionó el identificador del artículo.",
      );
    }

    if (!revisionId) {
      throw new ApiRequestError(
        "No se proporcionó el identificador de la revisión.",
      );
    }

    const article =
      await localWikiRepository.restoreArticleRevision(
        articleId,
        revisionId,
      );

    return jsonResponse({
      data: article,
      message:
        "La revisión fue restaurada correctamente.",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
};