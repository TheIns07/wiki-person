import { ZodError } from "zod";

import {
  WikiRepositoryError,
} from "./local-wiki-repository";

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);

    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function jsonResponse(
  data: unknown,
  status = 200,
): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function readJsonRequest(
  request: Request,
): Promise<unknown> {
  const contentType =
    request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new ApiRequestError(
      "La solicitud debe utilizar application/json.",
      415,
    );
  }

  try {
    return await request.json();
  } catch {
    throw new ApiRequestError(
      "El cuerpo de la solicitud contiene JSON inválido.",
      400,
    );
  }
}

export function apiErrorResponse(
  error: unknown,
): Response {
  if (error instanceof ApiRequestError) {
    return jsonResponse(
      {
        error: error.message,
      },
      error.status,
    );
  }

  if (error instanceof WikiRepositoryError) {
    return jsonResponse(
      {
        error: error.message,
        code: error.code,
      },
      error.status,
    );
  }

  if (error instanceof ZodError) {
    return jsonResponse(
      {
        error:
          "Los datos enviados no cumplen con el formato esperado.",

        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      422,
    );
  }

  console.error("Error inesperado en la API local:", error);

  return jsonResponse(
    {
      error:
        "Ocurrió un error inesperado al procesar la solicitud.",
    },
    500,
  );
}