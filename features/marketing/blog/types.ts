import { z } from "zod";

export const BlogArticleStatusSchema = z.enum([
  "draft",
  "published",
  "archived",
]);

export const BlogSlugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens only.");

const nullableUrl = z.union([z.string().url(), z.null()]);
const nullableText = z.union([z.string(), z.null()]);

export const BlogArticleSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  slug: BlogSlugSchema,
  title: z.string().min(1).max(160),
  excerpt: z.string().min(1).max(500),
  bodyMarkdown: z.string().min(1).max(150_000),
  authorName: z.string().min(1).max(120),
  authorTitle: z.string().max(160),
  category: z.string().min(1).max(80),
  heroImageUrl: nullableUrl,
  heroImageAlt: nullableText,
  seoTitle: z.string().max(180),
  seoDescription: z.string().max(320),
  status: BlogArticleStatusSchema,
  featured: z.boolean(),
  publishedAt: nullableText,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const BlogArticleInputSchema = z.object({
  id: z.string().uuid().optional(),
  slug: BlogSlugSchema,
  title: z.string().min(1).max(160),
  excerpt: z.string().min(1).max(500),
  bodyMarkdown: z.string().min(1).max(150_000),
  authorName: z.string().min(1).max(120),
  authorTitle: z.string().max(160).default(""),
  category: z.string().min(1).max(80),
  heroImageUrl: nullableUrl.default(null),
  heroImageAlt: nullableText.default(null),
  seoTitle: z.string().max(180).default(""),
  seoDescription: z.string().max(320).default(""),
  status: BlogArticleStatusSchema,
  featured: z.boolean().default(false),
});

export type BlogArticle = z.infer<typeof BlogArticleSchema>;
export type BlogArticleInput = z.infer<typeof BlogArticleInputSchema>;

export type BlogArticleSummary = Pick<
  BlogArticle,
  | "id"
  | "slug"
  | "title"
  | "excerpt"
  | "authorName"
  | "authorTitle"
  | "category"
  | "heroImageUrl"
  | "heroImageAlt"
  | "status"
  | "featured"
  | "publishedAt"
  | "updatedAt"
>;

export function slugifyBlogTitle(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");

  return slug || "article";
}

export function toBlogArticleSummary(article: BlogArticle): BlogArticleSummary {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    authorName: article.authorName,
    authorTitle: article.authorTitle,
    category: article.category,
    heroImageUrl: article.heroImageUrl,
    heroImageAlt: article.heroImageAlt,
    status: article.status,
    featured: article.featured,
    publishedAt: article.publishedAt,
    updatedAt: article.updatedAt,
  };
}
