import sanitizeHtml from "sanitize-html";
import slugify from "slugify";

import type { TocItem } from "../../types/wiki";
import { sanitizeWikiHtml } from "./sanitize-wiki-html";

interface PreparedWikiContent {
  leadHtml: string;
  contentHtml: string;
  plainText: string;
  toc: TocItem[];
}

function stripHtml(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createUniqueIdentifier(
  source: string,
  identifiers: Set<string>,
  fallbackIndex: number,
): string {
  const normalizedSource = slugify(source, {
    lower: true,
    strict: true,
    trim: true,
    locale: "es",
  });

  const baseIdentifier =
    normalizedSource || `seccion-${fallbackIndex}`;

  let identifier = baseIdentifier;
  let duplicateIndex = 2;

  while (identifiers.has(identifier)) {
    identifier = `${baseIdentifier}-${duplicateIndex}`;
    duplicateIndex += 1;
  }

  identifiers.add(identifier);

  return identifier;
}

function normalizeHeadings(
  html: string,
): {
  html: string;
  toc: TocItem[];
} {
  const usedIdentifiers = new Set<string>();
  const toc: TocItem[] = [];

  let headingIndex = 0;

  const normalizedHtml = html.replace(
    /<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (
      completeMatch,
      rawLevel: string,
      rawAttributes: string,
      innerHtml: string,
    ) => {
      headingIndex += 1;

      const level = Number(rawLevel) as 2 | 3 | 4;
      const label = stripHtml(innerHtml);

      const existingIdMatch = rawAttributes.match(
        /\sid=(["'])(.*?)\1/i,
      );

      const identifierSource =
        existingIdMatch?.[2] || label;

      const identifier = createUniqueIdentifier(
        identifierSource,
        usedIdentifiers,
        headingIndex,
      );

      const attributesWithoutId = rawAttributes.replace(
        /\sid=(["'])(.*?)\1/i,
        "",
      );

      toc.push({
        id: identifier,
        label: label || `Sección ${headingIndex}`,
        level,
      });

      return [
        `<h${level}`,
        attributesWithoutId,
        ` id="${identifier}">`,
        innerHtml,
        `</h${level}>`,
      ].join("");
    },
  );

  return {
    html: normalizedHtml,
    toc,
  };
}

export function prepareWikiContent(
  leadHtml: string,
  contentHtml: string,
): PreparedWikiContent {
  const sanitizedLeadHtml = sanitizeWikiHtml(leadHtml);
  const sanitizedContentHtml =
    sanitizeWikiHtml(contentHtml);

  const normalizedContent = normalizeHeadings(
    sanitizedContentHtml,
  );

  const plainText = stripHtml(
    `${sanitizedLeadHtml} ${normalizedContent.html}`,
  );

  return {
    leadHtml: sanitizedLeadHtml,
    contentHtml: normalizedContent.html,
    plainText,
    toc: normalizedContent.toc,
  };
}