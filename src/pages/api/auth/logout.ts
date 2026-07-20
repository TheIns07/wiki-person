import type {
    APIRoute,
  } from "astro";
  
  import {
    createSupabaseServerClient,
  } from "../../../lib/supabase/server";
  
  export const prerender = false;
  
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
          "[POST /api/auth/logout]",
          error,
        );
      }
  
      return Response.redirect(
        new URL(
          "/admin/login",
          request.url,
        ),
        303,
      );
    } catch (error) {
      console.error(
        "[POST /api/auth/logout] Error:",
        error,
      );
  
      return Response.redirect(
        new URL(
          "/admin/login",
          request.url,
        ),
        303,
      );
    }
  };