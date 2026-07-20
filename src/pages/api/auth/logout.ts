import type {
  APIRoute,
} from "astro";

import {
  createSupabaseServerClient,
} from "../../../lib/supabase/server";

export const prerender = false;

function redirectToLogin(
  request: Request,
): Response {
  const loginUrl = new URL(
    "/admin/login",
    request.url,
  );

  /*
   * Usamos new Response en lugar de
   * Response.redirect para que Astro/Netlify
   * pueda añadir las cookies eliminadas
   * durante signOut().
   */
  return new Response(null, {
    status: 303,
    headers: {
      Location: loginUrl.toString(),
      "Cache-Control": "no-store",
    },
  });
}

export const POST: APIRoute = async ({
  request,
  cookies,
}) => {
  try {
    const supabase =
      createSupabaseServerClient({
        request,
        cookies,
      });

    const {
      error,
    } = await supabase.auth.signOut();

    if (error) {
      console.error(
        "[POST /api/auth/logout] Error cerrando sesión:",
        error,
      );
    }

    return redirectToLogin(
      request,
    );
  } catch (error) {
    console.error(
      "[POST /api/auth/logout] Error inesperado:",
      error,
    );

    return redirectToLogin(
      request,
    );
  }
};