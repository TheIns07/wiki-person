import type { APIRoute } from "astro";

import type {
  ArticleEditorInput,
} from "../../../../lib/wiki/article-input";

import {
  apiErrorResponse,
  jsonResponse,
  readJsonRequest,
} from "../../../../lib/wiki/api-response";

import {
  localWikiRepository,
} from "../../../../lib/wiki/local-wiki-repository";

import type {
  ArticleStatus,
} from "../../../../types/wiki";

export const prerender = false;

const validStatuses: ArticleStatus[] = [
  "draft",
  "published",
  "archived",
];

export const GET: APIRoute = async ({ url }) => {
  try {
    const requestedStatus =
      url.searchParams.get("status");

    const search =
      url.searchParams.get("search") ?? undefined;

    const status =
      requestedStatus &&
      validStatuses.includes(
        requestedStatus as ArticleStatus,
      )
        ? (requestedStatus as ArticleStatus)
        : undefined;

    const articles =
      await localWikiRepository.listArticles({
        status,
        search,
      });

    return jsonResponse({
      data: articles,
      total: articles.length,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await readJsonRequest(request);

    const article =
      await localWikiRepository.createArticle(
        body as ArticleEditorInput,
      );

    return jsonResponse(
      {
        data: article,
        message: "El artículo fue creado correctamente.",
      },
      201,
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
};