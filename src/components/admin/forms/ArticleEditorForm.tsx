import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Controller,
  useForm,
  useWatch,
} from "react-hook-form";
import slugify from "slugify";
import { z } from "zod";

import type {
  Article,
  ArticleStatus,
  QuickFacts,
} from "../../../types/wiki";

import type {
  ArticleEditorInput,
} from "../../../lib/wiki/article-input";

import RichTextEditor from "../editor/RichTextEditor";
import QuickFactsEditor from "./QuickFactsEditor";

/* =========================================================
   Tipos del componente
   ========================================================= */

interface CategoryOption {
  id: string;
  name: string;
}

interface RelatedArticleOption {
  id: string;
  title: string;
  status: ArticleStatus;
}

interface ArticleEditorFormProps {
  mode: "create" | "edit";
  initialArticle?: Article;
  categories: CategoryOption[];
  relatedArticles: RelatedArticleOption[];
}

interface ArticleApiResponse {
  data?: Article;
  message?: string;
  error?: string;

  issues?: Array<{
    path: string;
    message: string;
  }>;
}

/* =========================================================
   Esquemas del formulario
   ========================================================= */

const quickFactRowFormSchema = z.object({
  id: z.string().min(1),

  label: z
    .string()
    .max(
      120,
      "La etiqueta no puede superar 120 caracteres.",
    ),

  value: z
    .string()
    .max(
      1000,
      "El valor no puede superar 1000 caracteres.",
    ),

  href: z
    .string()
    .max(
      500,
      "El enlace no puede superar 500 caracteres.",
    )
    .optional(),
});

const quickFactSectionFormSchema = z.object({
  id: z.string().min(1),

  title: z
    .string()
    .max(
      160,
      "El título de sección no puede superar 160 caracteres.",
    ),

  rows: z.array(quickFactRowFormSchema),
});

const quickFactsFormSchema = z.object({
  enabled: z.boolean(),

  title: z
    .string()
    .max(
      120,
      "El título no puede superar 120 caracteres.",
    ),

  summary: z
    .string()
    .max(
      300,
      "El resumen no puede superar 300 caracteres.",
    ),

  defaultOpen: z.boolean(),

  sections: z.array(
    quickFactSectionFormSchema,
  ),
});

type QuickFactsFormValue = z.infer<
  typeof quickFactsFormSchema
>;

const formSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título es obligatorio.")
    .max(
      180,
      "El título no puede superar 180 caracteres.",
    ),

  slug: z
    .string()
    .trim()
    .min(1, "La dirección del artículo es obligatoria.")
    .max(
      200,
      "La dirección no puede superar 200 caracteres.",
    ),

  subtitle: z
    .string()
    .trim()
    .max(
      240,
      "El subtítulo no puede superar 240 caracteres.",
    ),

  summary: z
    .string()
    .trim()
    .min(1, "El resumen es obligatorio.")
    .max(
      600,
      "El resumen no puede superar 600 caracteres.",
    ),

  leadHtml: z.string(),

  contentHtml: z.string(),

  featured: z.boolean(),

  quickFacts: quickFactsFormSchema,

  categoryIds: z.array(z.string()),

  relatedArticleIds: z.array(z.string()),

  aliasesText: z.string(),

  changeNote: z
    .string()
    .trim()
    .max(
      300,
      "La nota no puede superar 300 caracteres.",
    ),
});

type FormValues = z.infer<typeof formSchema>;

/* =========================================================
   Valores y etiquetas
   ========================================================= */

const EMPTY_QUICK_FACTS: QuickFacts = {
  enabled: false,
  title: "Datos rápidos",
  summary: "",
  defaultOpen: false,
  sections: [],
};

const statusLabels: Record<
  ArticleStatus,
  string
> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

/* =========================================================
   Utilidades
   ========================================================= */

function generateSlug(value: string): string {
  return slugify(value, {
    lower: true,
    strict: true,
    trim: true,
    locale: "es",
  });
}

function cloneQuickFacts(
  quickFacts: QuickFacts,
): QuickFactsFormValue {
  return {
    enabled: quickFacts.enabled,
    title: quickFacts.title || "Datos rápidos",
    summary: quickFacts.summary || "",
    defaultOpen: quickFacts.defaultOpen,

    sections: quickFacts.sections.map(
      (section) => ({
        id: section.id,
        title: section.title ?? "",

        rows: section.rows.map((row) => ({
          id: row.id,
          label: row.label ?? "",
          value: row.value,
          href: row.href || undefined,
        })),
      }),
    ),
  };
}

function prepareQuickFactsForRequest(
  quickFacts: QuickFactsFormValue,
): QuickFacts {
  return {
    enabled: quickFacts.enabled,

    title:
      quickFacts.title.trim() ||
      "Datos rápidos",

    summary: quickFacts.summary.trim(),

    defaultOpen: quickFacts.defaultOpen,

    sections: quickFacts.sections
      .map((section) => {
        const rows = section.rows
          .map((row) => ({
            id: row.id,
            label: row.label?.trim() || "",
            value: row.value.trim(),
            href: row.href?.trim() || undefined,
          }))
          .filter(
            (row) => row.value.length > 0,
          );

        return {
          id: section.id,
          title: section.title?.trim() || "",
          rows,
        };
      })
      .filter(
        (section) =>
          section.title.length > 0 ||
          section.rows.length > 0,
      ),
  };
}

function articleToFormValues(
  article: Article | undefined,
  mode: "create" | "edit",
): FormValues {
  return {
    title: article?.title ?? "",
    slug: article?.slug ?? "",
    subtitle: article?.subtitle ?? "",
    summary: article?.summary ?? "",

    leadHtml:
      article?.leadHtml ??
      "<p>Escribe aquí la introducción del artículo.</p>",

    contentHtml:
      article?.contentHtml ??
      "<h2>Primera sección</h2><p>Comienza a escribir el contenido.</p>",

    featured: article?.featured ?? false,

    quickFacts: cloneQuickFacts(
      article?.quickFacts ??
        EMPTY_QUICK_FACTS,
    ),

    categoryIds: [
      ...(article?.categoryIds ?? []),
    ],

    relatedArticleIds: [
      ...(article?.relatedArticleIds ?? []),
    ],

    aliasesText:
      article?.aliases.join("\n") ?? "",

    changeNote:
      mode === "create"
        ? "Creación del artículo"
        : "Actualización del artículo",
  };
}

/* =========================================================
   Componente
   ========================================================= */

export default function ArticleEditorForm({
  mode,
  initialArticle,
  categories,
  relatedArticles,
}: ArticleEditorFormProps) {
  const [savedArticle, setSavedArticle] =
    useState<Article | null>(
      initialArticle ?? null,
    );

  const [slugWasEdited, setSlugWasEdited] =
    useState(mode === "edit");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [requestError, setRequestError] =
    useState("");

  const defaultValues = useMemo<FormValues>(
    () =>
      articleToFormValues(
        initialArticle,
        mode,
      ),
    [initialArticle, mode],
  );

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,

    formState: {
      errors,
      isSubmitting,
      isDirty,
    },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const currentTitle = useWatch({
    control,
    name: "title",
  });

  /* Generación automática de slug para nuevos artículos. */
  useEffect(() => {
    if (
      mode !== "create" ||
      slugWasEdited
    ) {
      return;
    }

    const generatedSlug = generateSlug(
      currentTitle ?? "",
    );

    setValue(
      "slug",
      generatedSlug,
      {
        shouldValidate:
          generatedSlug.length > 0,

        shouldDirty:
          generatedSlug.length > 0,
      },
    );
  }, [
    currentTitle,
    mode,
    setValue,
    slugWasEdited,
  ]);

  /* =======================================================
     Guardado
     ======================================================= */

  async function saveArticle(
    values: FormValues,
    requestedStatus: ArticleStatus,
  ): Promise<void> {
    setRequestError("");
    setSuccessMessage("");

    const aliases = values.aliasesText
      .split("\n")
      .map((alias) => alias.trim())
      .filter(Boolean);

    const body: ArticleEditorInput = {
      title: values.title,
      slug: values.slug,
      subtitle: values.subtitle,
      summary: values.summary,

      leadHtml: values.leadHtml,
      contentHtml: values.contentHtml,

      /*
       * Por ahora preservamos el JSON existente.
       * Más adelante podemos guardar directamente
       * el documento JSON producido por Tiptap.
       */
      contentJson:
        savedArticle?.contentJson ??
        initialArticle?.contentJson ??
        null,

      status: requestedStatus,

      featured: values.featured,

      quickFacts:
        prepareQuickFactsForRequest(
          values.quickFacts,
        ),

      categoryIds: values.categoryIds,

      relatedArticleIds:
        values.relatedArticleIds,

      aliases,

      changeNote:
        values.changeNote ||
        (mode === "create"
          ? "Creación del artículo"
          : "Actualización del artículo"),
    };

    const articleId =
      savedArticle?.id ??
      initialArticle?.id;

    if (
      mode === "edit" &&
      !articleId
    ) {
      throw new Error(
        "No se encontró el identificador del artículo.",
      );
    }

    const endpoint =
      mode === "create"
        ? "/api/local/articles"
        : `/api/local/articles/${articleId}`;

    const response = await fetch(
      endpoint,
      {
        method:
          mode === "create"
            ? "POST"
            : "PATCH",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify(body),
      },
    );

    const result =
      (await response
        .json()
        .catch(() => ({}))) as ArticleApiResponse;

    if (
      !response.ok ||
      !result.data
    ) {
      const issueMessage =
        result.issues
          ?.map((issue) =>
            issue.path
              ? `${issue.path}: ${issue.message}`
              : issue.message,
          )
          .join(" ");

      throw new Error(
        issueMessage ||
          result.error ||
          "No fue posible guardar el artículo.",
      );
    }

    /*
     * Después de crear, redirigimos al editor
     * permanente del artículo.
     */
    if (mode === "create") {
      window.location.href =
        `/admin/articulos/${result.data.id}`;

      return;
    }

    /*
     * En edición actualizamos el estado local y
     * reiniciamos React Hook Form para que deje
     * de mostrar cambios pendientes.
     */
    setSavedArticle(result.data);

    reset(
      articleToFormValues(
        result.data,
        "edit",
      ),
    );

    setSlugWasEdited(true);

    setSuccessMessage(
      result.message ||
        "Los cambios fueron guardados.",
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function submitWithStatus(
    status: ArticleStatus,
  ): void {
    void handleSubmit(
      async (values) => {
        try {
          await saveArticle(
            values,
            status,
          );
        } catch (error) {
          setRequestError(
            error instanceof Error
              ? error.message
              : "No fue posible guardar el artículo.",
          );
        }
      },
    )();
  }

  /* =======================================================
     Eliminación
     ======================================================= */

  async function deleteArticle(): Promise<void> {
    const articleId =
      savedArticle?.id ??
      initialArticle?.id;

    if (!articleId) {
      setRequestError(
        "No se encontró el identificador del artículo.",
      );

      return;
    }

    const confirmed =
      window.confirm(
        [
          "¿Quieres eliminar definitivamente este artículo",
          "y todo su historial?",
          "",
          "Esta acción no se puede deshacer.",
        ].join(" "),
      );

    if (!confirmed) return;

    setRequestError("");
    setSuccessMessage("");

    try {
      const response = await fetch(
        `/api/local/articles/${articleId}`,
        {
          method: "DELETE",
        },
      );

      const result =
        (await response
          .json()
          .catch(() => ({}))) as ArticleApiResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No fue posible eliminar el artículo.",
        );
      }

      window.location.href =
        "/admin/articulos";
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "No fue posible eliminar el artículo.",
      );
    }
  }

  /* =======================================================
     Estado calculado
     ======================================================= */

  const currentStatus: ArticleStatus =
    savedArticle?.status ??
    initialArticle?.status ??
    "draft";

  const currentArticle =
    savedArticle ??
    initialArticle ??
    null;

  /* =======================================================
     Renderizado
     ======================================================= */

  return (
    <form
      className="article-editor-form"
      onSubmit={handleSubmit(
        async (values) => {
          try {
            await saveArticle(
              values,
              currentStatus,
            );
          } catch (error) {
            setRequestError(
              error instanceof Error
                ? error.message
                : "No fue posible guardar el artículo.",
            );
          }
        },
      )}
    >
      {(successMessage ||
        requestError) && (
        <div
          className={[
            "admin-message",

            requestError
              ? "admin-message--error"
              : "admin-message--success",
          ].join(" ")}
          role={
            requestError
              ? "alert"
              : "status"
          }
          aria-live="polite"
        >
          {requestError ||
            successMessage}
        </div>
      )}

      <div className="article-editor-layout">
        <div className="article-editor-main">
          {/* ===============================================
              Información principal
              =============================================== */}

          <section className="admin-form-section">
            <div className="admin-form-section__header">
              <div>
                <h2>
                  Información principal
                </h2>

                <p>
                  Identidad y descripción básica
                  del artículo.
                </p>
              </div>
            </div>

            <div className="admin-form-grid">
              <div className="admin-field admin-field--full">
                <label
                  className="admin-label"
                  htmlFor="article-title"
                >
                  Título
                </label>

                <input
                  id="article-title"
                  className="admin-input"
                  autoComplete="off"
                  {...register("title")}
                />

                {errors.title && (
                  <p className="admin-field-error">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div className="admin-field admin-field--full">
                <label
                  className="admin-label"
                  htmlFor="article-slug"
                >
                  Dirección del artículo
                </label>

                <div className="admin-slug-control">
                  <span>/wiki/</span>

                  <input
                    id="article-slug"
                    className="admin-input"
                    autoComplete="off"
                    {...register("slug", {
                      onChange() {
                        setSlugWasEdited(true);
                      },
                    })}
                  />

                  <button
                    type="button"
                    className="admin-button admin-button--secondary"
                    onClick={() => {
                      const nextSlug =
                        generateSlug(
                          currentTitle ?? "",
                        );

                      setSlugWasEdited(false);

                      setValue(
                        "slug",
                        nextSlug,
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        },
                      );
                    }}
                  >
                    Regenerar
                  </button>
                </div>

                {errors.slug && (
                  <p className="admin-field-error">
                    {errors.slug.message}
                  </p>
                )}
              </div>

              <div className="admin-field admin-field--full">
                <label
                  className="admin-label"
                  htmlFor="article-subtitle"
                >
                  Subtítulo
                </label>

                <input
                  id="article-subtitle"
                  className="admin-input"
                  autoComplete="off"
                  {...register("subtitle")}
                />

                {errors.subtitle && (
                  <p className="admin-field-error">
                    {errors.subtitle.message}
                  </p>
                )}
              </div>

              <div className="admin-field admin-field--full">
                <label
                  className="admin-label"
                  htmlFor="article-summary"
                >
                  Resumen
                </label>

                <textarea
                  id="article-summary"
                  className="admin-textarea"
                  rows={4}
                  {...register("summary")}
                />

                <p className="admin-field-help">
                  Se utiliza en la portada,
                  los resultados de búsqueda
                  y los metadatos de la página.
                </p>

                {errors.summary && (
                  <p className="admin-field-error">
                    {errors.summary.message}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ===============================================
              Introducción
              =============================================== */}

          <section className="admin-form-section">
            <div className="admin-form-section__header">
              <div>
                <h2>Introducción</h2>

                <p>
                  Texto que aparece antes de
                  Datos rápidos y del primer
                  encabezado.
                </p>
              </div>
            </div>

            <Controller
              name="leadHtml"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  label="Introducción del artículo"
                  value={field.value}
                  onChange={field.onChange}
                  allowHeadings={false}
                  minimumHeight={170}
                />
              )}
            />
          </section>

          {/* ===============================================
              Contenido principal
              =============================================== */}

          <section className="admin-form-section">
            <div className="admin-form-section__header">
              <div>
                <h2>Contenido</h2>

                <p>
                  Los encabezados H2, H3 y H4
                  generan automáticamente el
                  índice del artículo.
                </p>
              </div>
            </div>

            <Controller
              name="contentHtml"
              control={control}
              render={({ field }) => (
                <RichTextEditor
                  label="Contenido principal"
                  value={field.value}
                  onChange={field.onChange}
                  allowHeadings
                  minimumHeight={520}
                />
              )}
            />
          </section>

          {/* ===============================================
              Datos rápidos
              =============================================== */}

          <section className="admin-form-section">
            <div className="admin-form-section__header">
              <div>
                <h2>Datos rápidos</h2>

                <p>
                  Crea un resumen estructurado
                  y desplegable para el artículo.
                </p>
              </div>
            </div>

            <Controller
              name="quickFacts"
              control={control}
              render={({ field }) => (
                <QuickFactsEditor
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            {errors.quickFacts && (
              <p className="admin-field-error">
                Revisa la configuración de
                Datos rápidos.
              </p>
            )}
          </section>
        </div>

        {/* =================================================
            Barra lateral
            ================================================= */}

        <aside className="article-editor-sidebar">
          {/* Publicación */}

          <section className="admin-form-section">
            <h2>Publicación</h2>

            <div className="article-status-summary">
              <span>Estado actual</span>

              <strong
                className={
                  `status-badge status-badge--${currentStatus}`
                }
              >
                {statusLabels[currentStatus]}
              </strong>
            </div>

            {currentArticle && (
              <a
                className="admin-button admin-button--secondary admin-button--block"
                href={
                  `/admin/articulos/${currentArticle.id}/vista-previa`
                }
                target="_blank"
                rel="noreferrer"
              >
                Vista previa
              </a>
            )}

            {currentArticle?.status ===
              "published" && (
              <a
                className="admin-button admin-button--secondary admin-button--block"
                href={
                  `/wiki/${currentArticle.slug}`
                }
                target="_blank"
                rel="noreferrer"
              >
                Abrir página pública
              </a>
            )}

            {currentArticle && (
              <a
                className="admin-button admin-button--secondary admin-button--block"
                href={
                  `/admin/articulos/${currentArticle.id}/historial`
                }
              >
                Ver historial
              </a>
            )}

            <label className="admin-checkbox">
              <input
                type="checkbox"
                {...register("featured")}
              />

              <span>
                Mostrar como artículo destacado
              </span>
            </label>

            <div className="admin-field">
              <label
                className="admin-label"
                htmlFor="change-note"
              >
                Nota del cambio
              </label>

              <textarea
                id="change-note"
                className="admin-textarea"
                rows={3}
                {...register("changeNote")}
              />

              {errors.changeNote && (
                <p className="admin-field-error">
                  {errors.changeNote.message}
                </p>
              )}
            </div>
          </section>

          {/* Categorías */}

          <section className="admin-form-section">
            <h2>Categorías</h2>

            {categories.length > 0 ? (
              <div className="admin-checkbox-list">
                {categories.map(
                  (category) => (
                    <label
                      className="admin-checkbox"
                      key={category.id}
                    >
                      <input
                        type="checkbox"
                        value={category.id}
                        {...register(
                          "categoryIds",
                        )}
                      />

                      <span>
                        {category.name}
                      </span>
                    </label>
                  ),
                )}
              </div>
            ) : (
              <p className="admin-empty-text">
                No hay categorías registradas.
              </p>
            )}
          </section>

          {/* Alias */}

          <section className="admin-form-section">
            <h2>Alias</h2>

            <label
              className="admin-label"
              htmlFor="article-aliases"
            >
              Un alias por línea
            </label>

            <textarea
              id="article-aliases"
              className="admin-textarea"
              rows={5}
              placeholder={
                "Valle Yaqui\nValle agrícola del Yaqui"
              }
              {...register("aliasesText")}
            />
          </section>

          {/* Artículos relacionados */}

          <section className="admin-form-section">
            <h2>
              Artículos relacionados
            </h2>

            {relatedArticles.length > 0 ? (
              <div className="admin-checkbox-list">
                {relatedArticles.map(
                  (article) => (
                    <label
                      className="admin-checkbox"
                      key={article.id}
                    >
                      <input
                        type="checkbox"
                        value={article.id}
                        {...register(
                          "relatedArticleIds",
                        )}
                      />

                      <span>
                        {article.title}

                        <small>
                          {
                            statusLabels[
                              article.status
                            ]
                          }
                        </small>
                      </span>
                    </label>
                  ),
                )}
              </div>
            ) : (
              <p className="admin-empty-text">
                No existen otros artículos.
              </p>
            )}
          </section>

          {/* Zona de peligro */}

          {mode === "edit" && (
            <section className="admin-form-section admin-danger-zone">
              <h2>Zona de peligro</h2>

              <p>
                La eliminación también borra
                todas las revisiones locales.
              </p>

              <button
                type="button"
                className="admin-button admin-button--danger admin-button--block"
                onClick={() =>
                  void deleteArticle()
                }
                disabled={isSubmitting}
              >
                Eliminar artículo
              </button>
            </section>
          )}
        </aside>
      </div>

      {/* ===================================================
          Acciones inferiores
          =================================================== */}

      <footer className="article-editor-actions">
        <div>
          <span
            className={
              isDirty
                ? "article-editor-dirty"
                : "article-editor-saved"
            }
          >
            {isDirty
              ? "Hay cambios sin guardar"
              : "Sin cambios pendientes"}
          </span>
        </div>

        <div className="article-editor-actions__buttons">
          {mode === "edit" &&
            currentStatus !==
              "archived" && (
              <button
                type="button"
                className="admin-button admin-button--secondary"
                disabled={isSubmitting}
                onClick={() =>
                  submitWithStatus(
                    "archived",
                  )
                }
              >
                Archivar
              </button>
            )}

          {currentStatus !== "draft" && (
            <button
              type="button"
              className="admin-button admin-button--secondary"
              disabled={isSubmitting}
              onClick={() =>
                submitWithStatus("draft")
              }
            >
              Mover a borrador
            </button>
          )}

          <button
            type="submit"
            className="admin-button admin-button--secondary"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Guardando…"
              : mode === "create"
                ? "Guardar borrador"
                : "Guardar cambios"}
          </button>

          {currentStatus !==
            "published" ? (
            <button
              type="button"
              className="admin-button admin-button--primary"
              disabled={isSubmitting}
              onClick={() =>
                submitWithStatus(
                  "published",
                )
              }
            >
              Publicar
            </button>
          ) : (
            <button
              type="button"
              className="admin-button admin-button--primary"
              disabled={isSubmitting}
              onClick={() =>
                submitWithStatus(
                  "published",
                )
              }
            >
              Guardar y mantener publicado
            </button>
          )}
        </div>
      </footer>
    </form>
  );
}