import {
    createServerClient,
    parseCookieHeader,
    type CookieOptions,
  } from "@supabase/ssr";
  
  import type {
    AstroCookies,
  } from "astro";
  
  const supabaseUrl =
    import.meta.env.PUBLIC_SUPABASE_URL;
  
  const supabasePublishableKey =
    import.meta.env
      .PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  
  function validateEnvironment(): void {
    if (!supabaseUrl) {
      throw new Error(
        "Falta PUBLIC_SUPABASE_URL.",
      );
    }
  
    if (!supabasePublishableKey) {
      throw new Error(
        "Falta PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      );
    }
  }
  
  export function createSupabaseServerClient({
    request,
    cookies,
  }: {
    request: Request;
    cookies: AstroCookies;
  }) {
    validateEnvironment();
  
    return createServerClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        cookies: {
          getAll() {
            return parseCookieHeader(
              request.headers.get("cookie") ?? "",
            );
          },
  
          setAll(cookiesToSet) {
            for (const {
              name,
              value,
              options,
            } of cookiesToSet) {
              cookies.set(
                name,
                value,
                options as CookieOptions,
              );
            }
          },
        },
      },
    );
  }