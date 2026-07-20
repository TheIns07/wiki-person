import type {
    APIRoute,
  } from "astro";
  
  import {
    createSupabaseServerClient,
  } from "../../../lib/supabase/server";
  
  export const prerender = false;
  
  function redirectToLogin(
    request: Request,
    message: string,
  ): Response {
    const loginUrl = new URL(
      "/admin/login",
      request.url,
    );
  
    loginUrl.searchParams.set(
      "error",
      message,
    );
  
    return Response.redirect(
      loginUrl,
      303,
    );
  }
  
  export const POST: APIRoute = async ({
    request,
    cookies,
  }) => {
    try {
      const formData =
        await request.formData();
  
      const email =
        formData.get("email");
  
      const password =
        formData.get("password");
  
      if (
        typeof email !== "string" ||
        !email.trim()
      ) {
        return redirectToLogin(
          request,
          "Ingresa tu correo electrónico.",
        );
      }
  
      if (
        typeof password !== "string" ||
        !password
      ) {
        return redirectToLogin(
          request,
          "Ingresa tu contraseña.",
        );
      }
  
      const supabase =
        createSupabaseServerClient({
          request,
          cookies,
        });
  
      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
  
      if (
        authError ||
        !authData.user
      ) {
        console.error(
          "[POST /api/auth/login] Error de autenticación:",
          authError,
        );
  
        return redirectToLogin(
          request,
          "Correo o contraseña incorrectos.",
        );
      }
  
      /*
       * Verificamos que el usuario autenticado
       * tenga un perfil con role = admin.
       */
      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", authData.user.id)
        .single();
  
      if (profileError) {
        console.error(
          "[POST /api/auth/login] Error consultando perfil:",
          profileError,
        );
  
        await supabase.auth.signOut();
  
        return redirectToLogin(
          request,
          "No fue posible verificar tus permisos.",
        );
      }
  
      if (profile?.role !== "admin") {
        console.warn(
          "[POST /api/auth/login] Acceso rechazado:",
          {
            userId: authData.user.id,
            role: profile?.role ?? null,
          },
        );
  
        await supabase.auth.signOut();
  
        return redirectToLogin(
          request,
          "Tu cuenta no tiene permisos de administrador.",
        );
      }
  
      return Response.redirect(
        new URL("/admin", request.url),
        303,
      );
    } catch (error) {
      console.error(
        "[POST /api/auth/login] Error inesperado:",
        error,
      );
  
      const message =
        error instanceof Error
          ? error.message
          : "Error inesperado.";
  
      return redirectToLogin(
        request,
        message,
      );
    }
  };