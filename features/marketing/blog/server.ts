import "server-only";

import { unstable_noStore as noStore } from "next/cache";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  BlogArticleSchema,
  BlogSlugSchema,
  toBlogArticleSummary,
  type BlogArticle,
  type BlogArticleSummary,
} from "./types";

export const BLOG_CONTENT_BUCKET = "marketing-blog-content";
export const BLOG_MEDIA_BUCKET = "marketing-blog-media";
const BLOG_ARTICLE_DIRECTORY = "articles";
const STORAGE_PAGE_SIZE = 100;

export function blogArticleStoragePath(slug: string): string {
  return `${BLOG_ARTICLE_DIRECTORY}/${slug}.json`;
}

async function readStoredArticle(path: string): Promise<BlogArticle | null> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.storage.from(BLOG_CONTENT_BUCKET).download(path);
  if (error || !data) return null;

  try {
    const parsed = BlogArticleSchema.safeParse(JSON.parse(await data.text()));
    if (!parsed.success) {
      console.error("blog article failed schema validation", {
        path,
        issues: parsed.error.issues,
      });
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("blog article failed JSON parsing", { path, error });
    return null;
  }
}

async function listStoredArticlePaths(): Promise<string[]> {
  const admin = createAdminSupabase();
  const paths: string[] = [];

  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await admin.storage
      .from(BLOG_CONTENT_BUCKET)
      .list(BLOG_ARTICLE_DIRECTORY, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

    if (error) {
      throw new Error(`Blog article storage listing failed: ${error.message}`);
    }

    const page = data ?? [];
    for (const item of page) {
      if (item.name.endsWith(".json")) {
        paths.push(`${BLOG_ARTICLE_DIRECTORY}/${item.name}`);
      }
    }

    if (page.length < STORAGE_PAGE_SIZE) break;
  }

  return paths;
}

export async function listBlogArticlesForOps(): Promise<BlogArticle[]> {
  noStore();
  const paths = await listStoredArticlePaths();
  const rows = await Promise.all(paths.map((path) => readStoredArticle(path)));
  const byId = new Map<string, BlogArticle>();

  for (const article of rows) {
    if (!article) continue;
    const current = byId.get(article.id);
    if (!current || article.updatedAt > current.updatedAt) {
      byId.set(article.id, article);
    }
  }

  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listPublishedBlogArticles(
  limit?: number,
): Promise<BlogArticleSummary[]> {
  noStore();
  const articles = (await listBlogArticlesForOps())
    .filter((article) => article.status === "published")
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      const aDate = a.publishedAt ?? a.updatedAt;
      const bDate = b.publishedAt ?? b.updatedAt;
      return bDate.localeCompare(aDate);
    })
    .map(toBlogArticleSummary);

  return typeof limit === "number" ? articles.slice(0, Math.max(0, limit)) : articles;
}

export async function getPublishedBlogArticleBySlug(
  slug: string,
): Promise<BlogArticle | null> {
  noStore();
  const parsedSlug = BlogSlugSchema.safeParse(slug);
  if (!parsedSlug.success) return null;

  const article = await readStoredArticle(blogArticleStoragePath(parsedSlug.data));
  if (!article || article.slug !== parsedSlug.data || article.status !== "published") {
    return null;
  }
  return article;
}
