import { useState } from "react";

import type {
  ArticleRevision,
  ArticleStatus,
} from "../../../types/wiki";

interface RevisionHistoryProps {
  articleId: string;
  articleTitle: string;
  revisions: ArticleRevision[];
}

interface RestoreResponse {
  message?: string;
  error?: string;
}

const statusLabels: Record<ArticleStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

export default function RevisionHistory({
  articleId,
  articleTitle,
  revisions,
}: RevisionHistoryProps) {
  const [restoringRevisionId, setRestoringRevisionId] =
    useState<string | null>(null);

  const [error, setError] = useState("");

  const dateFormatter = new Intl.DateTimeFormat(
    "es-MX",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  );

  async function restoreRevision(
    revision: ArticleRevision,
  ): Promise<void> {
    const confirmed = window.confirm(
      [
        `¿Quieres restaurar la revisión ${revision.revisionNumber}`,
        `del artículo "${articleTitle}"?`,
        "",
        "La versión actual se conservará como una nueva revisión.",
      ].join(" "),
    );

    if (!confirmed) return;

    setError("");
    setRestoringRevisionId(revision.id);

    try {
      const response = await fetch(
        `/api/local/articles/${articleId}/revisions/${revision.id}/restore`,
        {
          method: "POST",
        },
      );

      const result =
        (await response
          .json()
          .catch(() => ({}))) as RestoreResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "No fue posible restaurar la revisión.",
        );
      }

      window.location.href =
        `/admin/articulos/${articleId}`;
    } catch (restoreError) {
      setError(
        restoreError instanceof Error
          ? restoreError.message
          : "No fue posible restaurar la revisión.",
      );

      setRestoringRevisionId(null);
    }
  }

  if (revisions.length === 0) {
    return (
      <section className="admin-panel">
        <p className="admin-empty-text">
          Este artículo todavía no tiene revisiones
          registradas.
        </p>
      </section>
    );
  }

  return (
    <div className="revision-history">
      {error && (
        <div
          className="admin-message admin-message--error"
          role="alert"
        >
          {error}
        </div>
      )}

      {revisions.map((revision, index) => (
        <article
          className="revision-card"
          key={revision.id}
        >
          <header className="revision-card__header">
            <div>
              <div className="revision-card__title">
                <strong>
                  Revisión {revision.revisionNumber}
                </strong>

                {index === 0 && (
                  <span className="revision-current-label">
                    Más reciente
                  </span>
                )}
              </div>

              <p>
                {dateFormatter.format(
                  new Date(revision.createdAt),
                )}
              </p>
            </div>

            <span
              className={`status-badge status-badge--${revision.status}`}
            >
              {statusLabels[revision.status]}
            </span>
          </header>

          <div className="revision-card__content">
            <dl className="revision-metadata">
              <div>
                <dt>Nota</dt>

                <dd>
                  {revision.changeNote ||
                    "Sin nota del cambio"}
                </dd>
              </div>

              <div>
                <dt>Título</dt>

                <dd>{revision.title}</dd>
              </div>

              <div>
                <dt>Dirección</dt>

                <dd>/wiki/{revision.slug}</dd>
              </div>

              <div>
                <dt>Secciones</dt>

                <dd>{revision.toc.length}</dd>
              </div>

              <div>
                <dt>Categorías</dt>

                <dd>{revision.categoryIds.length}</dd>
              </div>
            </dl>

            <details className="revision-details">
              <summary>
                Mostrar resumen de esta versión
              </summary>

              <p>
                {revision.summary ||
                  "Esta revisión no tiene resumen."}
              </p>
            </details>
          </div>

          <footer className="revision-card__actions">
            <button
              type="button"
              className="admin-button admin-button--secondary"
              disabled={
                restoringRevisionId !== null
              }
              onClick={() =>
                void restoreRevision(revision)
              }
            >
              {restoringRevisionId === revision.id
                ? "Restaurando…"
                : "Restaurar esta revisión"}
            </button>
          </footer>
        </article>
      ))}
    </div>
  );
}