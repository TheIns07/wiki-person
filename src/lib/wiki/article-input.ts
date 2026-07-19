import { z } from "zod";

const optionalIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .optional();

const quickFactRowSchema = z.object({
  id: optionalIdentifierSchema,

  label: z
    .string()
    .trim()
    .max(120)
    .optional()
    .default(""),

  value: z
    .string()
    .trim()
    .min(1, "El valor del dato rápido es obligatorio.")
    .max(1000),

  href: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default(""),
});

const quickFactSectionSchema = z.object({
  id: optionalIdentifierSchema,

  title: z
    .string()
    .trim()
    .max(160)
    .optional()
    .default(""),

  rows: z.array(quickFactRowSchema).default([]),
});

const quickFactsSchema = z.object({
  enabled: z.boolean().default(false),

  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .default("Datos rápidos"),

  summary: z
    .string()
    .trim()
    .max(300)
    .default(""),

  defaultOpen: z.boolean().default(false),

  sections: z.array(quickFactSectionSchema).default([]),
});

export const articleEditorInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "El título es obligatorio.")
    .max(180),

  slug: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default(""),

  subtitle: z
    .string()
    .trim()
    .max(240)
    .default(""),

  summary: z
    .string()
    .trim()
    .min(1, "El resumen es obligatorio.")
    .max(600),

  leadHtml: z
    .string()
    .max(50_000)
    .default(""),

  contentHtml: z
    .string()
    .max(500_000)
    .default(""),

  contentJson: z
    .record(z.string(), z.unknown())
    .nullable()
    .default(null),

  status: z
    .enum(["draft", "published", "archived"])
    .default("draft"),

  featured: z.boolean().default(false),

  quickFacts: quickFactsSchema.default({
    enabled: false,
    title: "Datos rápidos",
    summary: "",
    defaultOpen: false,
    sections: [],
  }),

  categoryIds: z.array(z.string().trim()).default([]),

  aliases: z
    .array(z.string().trim().min(1).max(180))
    .default([]),

  relatedArticleIds: z
    .array(z.string().trim())
    .default([]),

  changeNote: z
    .string()
    .trim()
    .max(300)
    .default("Actualización del artículo"),
});

/**
 * Datos que puede recibir el repositorio antes de que
 * Zod aplique valores predeterminados.
 */
export type ArticleEditorInput = z.input<
  typeof articleEditorInputSchema
>;

/**
 * Datos ya validados y normalizados por Zod.
 */
export type ParsedArticleEditorInput = z.output<
  typeof articleEditorInputSchema
>;