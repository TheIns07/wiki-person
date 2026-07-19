import sanitizeHtml from "sanitize-html";

export function sanitizeWikiHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "h2",
      "h3",
      "h4",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "code",
      "pre",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "sup",
      "sub",
      "span",
      "hr",
    ],

    allowedAttributes: {
      a: [
        "href",
        "title",
        "class",
        "target",
        "rel",
      ],
      h2: ["id"],
      h3: ["id"],
      h4: ["id"],
      li: ["id"],
      span: ["class"],
      sup: ["id"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
    },

    allowedClasses: {
      a: [
        "missing-link",
        "external-link",
        "internal-link",
      ],
      span: [
        "reference",
        "reference-label",
      ],
    },

    allowedSchemes: [
      "http",
      "https",
      "mailto",
    ],

    allowProtocolRelative: false,

    transformTags: {
      a: (tagName, attributes) => {
        const isExternal =
          attributes.href?.startsWith("http://") ||
          attributes.href?.startsWith("https://");

        if (!isExternal) {
          return {
            tagName,
            attribs: attributes,
          };
        }

        return {
          tagName,
          attribs: {
            ...attributes,
            target: "_blank",
            rel: "noopener noreferrer",
          },
        };
      },
    },
  });
}