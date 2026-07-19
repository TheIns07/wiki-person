import type {
    QuickFactRow,
    QuickFactSection,
    QuickFacts,
  } from "../../../types/wiki";
  
  interface QuickFactsEditorProps {
    value: QuickFacts;
    onChange: (value: QuickFacts) => void;
  }
  
  function createIdentifier(prefix: string): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  
    return `${prefix}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
  }
  
  function moveItem<T>(
    items: T[],
    currentIndex: number,
    direction: -1 | 1,
  ): T[] {
    const nextIndex = currentIndex + direction;
  
    if (nextIndex < 0 || nextIndex >= items.length) {
      return items;
    }
  
    const updatedItems = [...items];
  
    const [movedItem] = updatedItems.splice(
      currentIndex,
      1,
    );
  
    updatedItems.splice(nextIndex, 0, movedItem);
  
    return updatedItems;
  }
  
  function createEmptyRow(): QuickFactRow {
    return {
      id: createIdentifier("quick-fact-row"),
      label: "",
      value: "",
      href: "",
    };
  }
  
  function createEmptySection(): QuickFactSection {
    return {
      id: createIdentifier("quick-fact-section"),
      title: "",
      rows: [createEmptyRow()],
    };
  }
  
  export default function QuickFactsEditor({
    value,
    onChange,
  }: QuickFactsEditorProps) {
    function updateRootValue<K extends keyof QuickFacts>(
      key: K,
      nextValue: QuickFacts[K],
    ): void {
      onChange({
        ...value,
        [key]: nextValue,
      });
    }
  
    function updateSections(
      sections: QuickFactSection[],
    ): void {
      onChange({
        ...value,
        sections,
      });
    }
  
    function updateSection(
      sectionIndex: number,
      nextSection: QuickFactSection,
    ): void {
      const nextSections = value.sections.map(
        (section, currentIndex) =>
          currentIndex === sectionIndex
            ? nextSection
            : section,
      );
  
      updateSections(nextSections);
    }
  
    function updateSectionTitle(
      sectionIndex: number,
      title: string,
    ): void {
      const section = value.sections[sectionIndex];
  
      updateSection(sectionIndex, {
        ...section,
        title,
      });
    }
  
    function addSection(): void {
      updateSections([
        ...value.sections,
        createEmptySection(),
      ]);
    }
  
    function removeSection(
      sectionIndex: number,
    ): void {
      const confirmed = window.confirm(
        "¿Quieres eliminar esta sección y todas sus filas?",
      );
  
      if (!confirmed) return;
  
      updateSections(
        value.sections.filter(
          (_, currentIndex) =>
            currentIndex !== sectionIndex,
        ),
      );
    }
  
    function moveSection(
      sectionIndex: number,
      direction: -1 | 1,
    ): void {
      updateSections(
        moveItem(
          value.sections,
          sectionIndex,
          direction,
        ),
      );
    }
  
    function updateRows(
      sectionIndex: number,
      rows: QuickFactRow[],
    ): void {
      const section = value.sections[sectionIndex];
  
      updateSection(sectionIndex, {
        ...section,
        rows,
      });
    }
  
    function updateRow(
      sectionIndex: number,
      rowIndex: number,
      nextRow: QuickFactRow,
    ): void {
      const section = value.sections[sectionIndex];
  
      const nextRows = section.rows.map(
        (row, currentIndex) =>
          currentIndex === rowIndex
            ? nextRow
            : row,
      );
  
      updateRows(sectionIndex, nextRows);
    }
  
    function updateRowField<
      K extends keyof QuickFactRow,
    >(
      sectionIndex: number,
      rowIndex: number,
      key: K,
      nextValue: QuickFactRow[K],
    ): void {
      const row =
        value.sections[sectionIndex].rows[rowIndex];
  
      updateRow(sectionIndex, rowIndex, {
        ...row,
        [key]: nextValue,
      });
    }
  
    function addRow(sectionIndex: number): void {
      const section = value.sections[sectionIndex];
  
      updateRows(sectionIndex, [
        ...section.rows,
        createEmptyRow(),
      ]);
    }
  
    function removeRow(
      sectionIndex: number,
      rowIndex: number,
    ): void {
      const section = value.sections[sectionIndex];
  
      updateRows(
        sectionIndex,
        section.rows.filter(
          (_, currentIndex) =>
            currentIndex !== rowIndex,
        ),
      );
    }
  
    function moveRow(
      sectionIndex: number,
      rowIndex: number,
      direction: -1 | 1,
    ): void {
      const section = value.sections[sectionIndex];
  
      updateRows(
        sectionIndex,
        moveItem(
          section.rows,
          rowIndex,
          direction,
        ),
      );
    }
  
    return (
      <div className="quick-facts-editor">
        <div className="quick-facts-editor__status">
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={value.enabled}
              onChange={(event) =>
                updateRootValue(
                  "enabled",
                  event.target.checked,
                )
              }
            />
  
            <span>
              Activar Datos rápidos en este artículo
            </span>
          </label>
        </div>
  
        <div className="admin-form-grid">
          <div className="admin-field">
            <label
              className="admin-label"
              htmlFor="quick-facts-title"
            >
              Título del bloque
            </label>
  
            <input
              id="quick-facts-title"
              className="admin-input"
              value={value.title}
              disabled={!value.enabled}
              onChange={(event) =>
                updateRootValue(
                  "title",
                  event.target.value,
                )
              }
            />
          </div>
  
          <div className="admin-field">
            <label
              className="admin-label"
              htmlFor="quick-facts-summary"
            >
              Resumen cerrado
            </label>
  
            <input
              id="quick-facts-summary"
              className="admin-input"
              value={value.summary}
              disabled={!value.enabled}
              placeholder="Ubicación, fechas y datos principales"
              onChange={(event) =>
                updateRootValue(
                  "summary",
                  event.target.value,
                )
              }
            />
          </div>
        </div>
  
        <label className="admin-checkbox quick-facts-editor__default-open">
          <input
            type="checkbox"
            checked={value.defaultOpen}
            disabled={!value.enabled}
            onChange={(event) =>
              updateRootValue(
                "defaultOpen",
                event.target.checked,
              )
            }
          />
  
          <span>
            Mostrar el bloque abierto inicialmente
          </span>
        </label>
  
        {!value.enabled ? (
          <div className="quick-facts-editor__disabled">
            Los Datos rápidos están desactivados. La
            configuración se conservará, pero no aparecerá
            en la página pública.
          </div>
        ) : (
          <>
            <div className="quick-facts-editor__heading">
              <div>
                <h3>Secciones y filas</h3>
  
                <p>
                  Cada fila puede contener una etiqueta, un
                  valor y un enlace opcional.
                </p>
              </div>
  
              <button
                type="button"
                className="admin-button admin-button--secondary"
                onClick={addSection}
              >
                Agregar sección
              </button>
            </div>
  
            {value.sections.length === 0 ? (
              <div className="quick-facts-editor__empty">
                <p>
                  Este bloque todavía no tiene secciones.
                </p>
  
                <button
                  type="button"
                  className="admin-button admin-button--secondary"
                  onClick={addSection}
                >
                  Crear primera sección
                </button>
              </div>
            ) : (
              <div className="quick-facts-section-list">
                {value.sections.map(
                  (section, sectionIndex) => (
                    <section
                      className="quick-facts-section-editor"
                      key={section.id}
                    >
                      <header className="quick-facts-section-editor__header">
                        <div className="quick-facts-section-editor__title">
                          <span>
                            Sección {sectionIndex + 1}
                          </span>
  
                          <input
                            className="admin-input"
                            value={section.title ?? ""}
                            placeholder="Título de la sección"
                            aria-label={`Título de la sección ${
                              sectionIndex + 1
                            }`}
                            onChange={(event) =>
                              updateSectionTitle(
                                sectionIndex,
                                event.target.value,
                              )
                            }
                          />
                        </div>
  
                        <div className="quick-facts-order-actions">
                          <button
                            type="button"
                            aria-label="Mover sección hacia arriba"
                            title="Mover hacia arriba"
                            disabled={sectionIndex === 0}
                            onClick={() =>
                              moveSection(
                                sectionIndex,
                                -1,
                              )
                            }
                          >
                            ↑
                          </button>
  
                          <button
                            type="button"
                            aria-label="Mover sección hacia abajo"
                            title="Mover hacia abajo"
                            disabled={
                              sectionIndex ===
                              value.sections.length - 1
                            }
                            onClick={() =>
                              moveSection(
                                sectionIndex,
                                1,
                              )
                            }
                          >
                            ↓
                          </button>
  
                          <button
                            type="button"
                            className="quick-facts-delete-button"
                            aria-label="Eliminar sección"
                            title="Eliminar sección"
                            onClick={() =>
                              removeSection(sectionIndex)
                            }
                          >
                            ×
                          </button>
                        </div>
                      </header>
  
                      <div className="quick-facts-row-list">
                        {section.rows.map(
                          (row, rowIndex) => (
                            <article
                              className="quick-facts-row-editor"
                              key={row.id}
                            >
                              <div className="quick-facts-row-editor__number">
                                {rowIndex + 1}
                              </div>
  
                              <div className="quick-facts-row-editor__fields">
                                <div className="admin-field">
                                  <label className="admin-label">
                                    Etiqueta
                                  </label>
  
                                  <input
                                    className="admin-input"
                                    value={row.label ?? ""}
                                    placeholder="Nacimiento"
                                    onChange={(event) =>
                                      updateRowField(
                                        sectionIndex,
                                        rowIndex,
                                        "label",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
  
                                <div className="admin-field">
                                  <label className="admin-label">
                                    Valor
                                  </label>
  
                                  <textarea
                                    className="admin-textarea"
                                    rows={2}
                                    value={row.value}
                                    placeholder="6 de febrero de 1911"
                                    onChange={(event) =>
                                      updateRowField(
                                        sectionIndex,
                                        rowIndex,
                                        "value",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
  
                                <div className="admin-field admin-field--full">
                                  <label className="admin-label">
                                    Enlace opcional
                                  </label>
  
                                  <input
                                    className="admin-input"
                                    value={row.href ?? ""}
                                    placeholder="/wiki/otro-articulo"
                                    onChange={(event) =>
                                      updateRowField(
                                        sectionIndex,
                                        rowIndex,
                                        "href",
                                        event.target.value,
                                      )
                                    }
                                  />
                                </div>
                              </div>
  
                              <div className="quick-facts-order-actions quick-facts-order-actions--vertical">
                                <button
                                  type="button"
                                  aria-label="Mover fila hacia arriba"
                                  title="Mover hacia arriba"
                                  disabled={rowIndex === 0}
                                  onClick={() =>
                                    moveRow(
                                      sectionIndex,
                                      rowIndex,
                                      -1,
                                    )
                                  }
                                >
                                  ↑
                                </button>
  
                                <button
                                  type="button"
                                  aria-label="Mover fila hacia abajo"
                                  title="Mover hacia abajo"
                                  disabled={
                                    rowIndex ===
                                    section.rows.length - 1
                                  }
                                  onClick={() =>
                                    moveRow(
                                      sectionIndex,
                                      rowIndex,
                                      1,
                                    )
                                  }
                                >
                                  ↓
                                </button>
  
                                <button
                                  type="button"
                                  className="quick-facts-delete-button"
                                  aria-label="Eliminar fila"
                                  title="Eliminar fila"
                                  onClick={() =>
                                    removeRow(
                                      sectionIndex,
                                      rowIndex,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            </article>
                          ),
                        )}
                      </div>
  
                      <button
                        type="button"
                        className="admin-button admin-button--secondary"
                        onClick={() =>
                          addRow(sectionIndex)
                        }
                      >
                        Agregar fila
                      </button>
                    </section>
                  ),
                )}
              </div>
            )}
  
            <section className="quick-facts-preview">
              <h3>Vista previa del bloque</h3>
  
              <details open={value.defaultOpen}>
                <summary>
                  <span>
                    <strong>
                      {value.title || "Datos rápidos"}
                    </strong>
  
                    {value.summary && (
                      <span className="quick-facts-preview__summary">
                        {value.summary}
                      </span>
                    )}
                  </span>
  
                  <span aria-hidden="true">⌄</span>
                </summary>
  
                <div>
                  {value.sections.map((section) => (
                    <section key={section.id}>
                      {section.title && (
                        <h4>{section.title}</h4>
                      )}
  
                      <dl>
                        {section.rows.map((row) => (
                          <div key={row.id}>
                            {row.label && (
                              <dt>{row.label}</dt>
                            )}
  
                            <dd>
                              {row.href ? (
                                <a href={row.href}>
                                  {row.value ||
                                    "Valor pendiente"}
                                </a>
                              ) : (
                                row.value ||
                                "Valor pendiente"
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </div>
              </details>
            </section>
          </>
        )}
      </div>
    );
  }