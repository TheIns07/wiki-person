import { useEffect, useId } from "react";

import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface RichTextEditorProps {
  label: string;
  value: string;
  onChange: (html: string) => void;
  allowHeadings?: boolean;
  minimumHeight?: number;
}

interface ToolbarButtonProps {
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}

function ToolbarButton({
  active = false,
  disabled = false,
  children,
  title,
  onClick,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={[
        "wiki-editor-toolbar__button",
        active ? "wiki-editor-toolbar__button--active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      title={title}
      aria-label={title}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  label,
  value,
  onChange,
  allowHeadings = true,
  minimumHeight = 260,
}: RichTextEditorProps) {
  const generatedId = useId();
  const labelId = `${generatedId}-label`;

  const editor = useEditor({
    immediatelyRender: false,

    extensions: [
      StarterKit.configure({
        heading: allowHeadings
          ? {
              levels: [2, 3, 4],
            }
          : false,
      }),

      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
    ],

    content: value || "<p></p>",

    editorProps: {
      attributes: {
        class: "wiki-rich-editor__content",
        "aria-labelledby": labelId,
      },
    },

    onUpdate({ editor: currentEditor }) {
      onChange(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;

    const nextContent = value || "<p></p>";

    if (editor.getHTML() !== nextContent) {
      editor.commands.setContent(nextContent, {
        emitUpdate: false,
      });
    }
  }, [editor, value]);

  function editLink(): void {
    if (!editor) return;

    const currentHref =
      (editor.getAttributes("link").href as string | undefined) ??
      "";

    const href = window.prompt(
      "Escribe una ruta interna o una URL externa:",
      currentHref,
    );

    if (href === null) return;

    const normalizedHref = href.trim();

    if (!normalizedHref) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .unsetLink()
        .run();

      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href: normalizedHref,
      })
      .run();
  }

  if (!editor) {
    return (
      <div className="wiki-rich-editor">
        <p className="admin-label" id={labelId}>
          {label}
        </p>

        <div
          className="wiki-rich-editor__loading"
          style={{ minHeight: minimumHeight }}
        >
          Cargando editor…
        </div>
      </div>
    );
  }

  return (
    <div className="wiki-rich-editor">
      <p className="admin-label" id={labelId}>
        {label}
      </p>

      <div
        className="wiki-rich-editor__frame"
        style={
          {
            "--editor-min-height": `${minimumHeight}px`,
          } as React.CSSProperties
        }
      >
        <div
          className="wiki-editor-toolbar"
          role="toolbar"
          aria-label={`Herramientas de ${label}`}
        >
          <ToolbarButton
            title="Párrafo"
            active={editor.isActive("paragraph")}
            onClick={() =>
              editor.chain().focus().setParagraph().run()
            }
          >
            ¶
          </ToolbarButton>

          {allowHeadings && (
            <>
              <ToolbarButton
                title="Encabezado de nivel 2"
                active={editor.isActive("heading", {
                  level: 2,
                })}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: 2 })
                    .run()
                }
              >
                H2
              </ToolbarButton>

              <ToolbarButton
                title="Encabezado de nivel 3"
                active={editor.isActive("heading", {
                  level: 3,
                })}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: 3 })
                    .run()
                }
              >
                H3
              </ToolbarButton>

              <ToolbarButton
                title="Encabezado de nivel 4"
                active={editor.isActive("heading", {
                  level: 4,
                })}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .toggleHeading({ level: 4 })
                    .run()
                }
              >
                H4
              </ToolbarButton>
            </>
          )}

          <span className="wiki-editor-toolbar__separator" />

          <ToolbarButton
            title="Negritas"
            active={editor.isActive("bold")}
            onClick={() =>
              editor.chain().focus().toggleBold().run()
            }
          >
            <strong>B</strong>
          </ToolbarButton>

          <ToolbarButton
            title="Cursivas"
            active={editor.isActive("italic")}
            onClick={() =>
              editor.chain().focus().toggleItalic().run()
            }
          >
            <em>I</em>
          </ToolbarButton>

          <ToolbarButton
            title="Enlace"
            active={editor.isActive("link")}
            onClick={editLink}
          >
            Enlace
          </ToolbarButton>

          <span className="wiki-editor-toolbar__separator" />

          <ToolbarButton
            title="Lista con viñetas"
            active={editor.isActive("bulletList")}
            onClick={() =>
              editor
                .chain()
                .focus()
                .toggleBulletList()
                .run()
            }
          >
            • Lista
          </ToolbarButton>

          <ToolbarButton
            title="Lista numerada"
            active={editor.isActive("orderedList")}
            onClick={() =>
              editor
                .chain()
                .focus()
                .toggleOrderedList()
                .run()
            }
          >
            1. Lista
          </ToolbarButton>

          <ToolbarButton
            title="Cita"
            active={editor.isActive("blockquote")}
            onClick={() =>
              editor
                .chain()
                .focus()
                .toggleBlockquote()
                .run()
            }
          >
            “ ”
          </ToolbarButton>

          {allowHeadings && (
            <ToolbarButton
              title="Separador horizontal"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .setHorizontalRule()
                  .run()
              }
            >
              ―
            </ToolbarButton>
          )}

          <span className="wiki-editor-toolbar__separator" />

          <ToolbarButton
            title="Deshacer"
            disabled={
              !editor.can().chain().focus().undo().run()
            }
            onClick={() =>
              editor.chain().focus().undo().run()
            }
          >
            ↶
          </ToolbarButton>

          <ToolbarButton
            title="Rehacer"
            disabled={
              !editor.can().chain().focus().redo().run()
            }
            onClick={() =>
              editor.chain().focus().redo().run()
            }
          >
            ↷
          </ToolbarButton>
        </div>

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}