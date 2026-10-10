import { NextResponse } from "next/server";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import {
  BLOG_CONTENT_BUCKET,
  blogArticleStoragePath,
  listBlogArticlesForOps,
} from "@/features/marketing/blog/server";
import {
  BlogArticleInputSchema,
  BlogArticleSchema,
  type BlogArticle,
} from "@/features/marketing/blog/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  try {
    const articles = await listBlogArticlesForOps();
    return NextResponse.json({ articles });
  } catch (error) {
    console.error("ops blog listing failed", error);
    return NextResponse.json({ error: "Unable to load blog articles" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const payload = await request.json().catch(() => null);
  const parsed = BlogArticleInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid article", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.heroImageUrl && !parsed.data.heroImageAlt?.trim()) {
    return NextResponse.json(
      { error: "Hero image alt text is required when a hero image is set" },
      { status: 400 },
    );
  }

  let articles: BlogArticle[];
  try {
    articles = await listBlogArticlesForOps();
  } catch (error) {
    console.error("ops blog pre-write listing failed", error);
    return NextResponse.json({ error: "Unable to verify article state" }, { status: 500 });
  }

  const existing = parsed.data.id
    ? articles.find((article) => article.id === parsed.data.id) ?? null
    : null;

  if (parsed.data.id && !existing) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const slugOwner = articles.find(
    (article) => article.slug === parsed.data.slug && article.id !== existing?.id,
  );
  if (slugOwner) {
    return NextResponse.json({ error: "That article URL is already in use" }, { status: 409 });
  }

  if (existing?.status === "published" && existing.slug !== parsed.data.slug) {
    return NextResponse.json(
      { error: "Unpublish the article before changing its URL" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const nextArticle = BlogArticleSchema.parse({
    version: 1,
    id: existing?.id ?? crypto.randomUUID(),
    slug: parsed.data.slug,
    title: parsed.data.title,
    excerpt: parsed.data.excerpt,
    bodyMarkdown: parsed.data.bodyMarkdown,
    authorName: parsed.data.authorName,
    authorTitle: parsed.data.authorTitle,
    category: parsed.data.category,
    heroImageUrl: parsed.data.heroImageUrl,
    heroImageAlt: parsed.data.heroImageAlt,
    seoTitle: parsed.data.seoTitle,
    seoDescription: parsed.data.seoDescription,
    status: parsed.data.status,
    featured: parsed.data.featured,
    publishedAt:
      parsed.data.status === "published"
        ? existing?.publishedAt ?? now
        : existing?.publishedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  const admin = createAdminSupabase();
  const nextPath = blogArticleStoragePath(nextArticle.slug);
  const body = Buffer.from(`${JSON.stringify(nextArticle, null, 2)}\n`, "utf8");
  const { error: uploadError } = await admin.storage
    .from(BLOG_CONTENT_BUCKET)
    .upload(nextPath, body, {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (uploadError) {
    console.error("ops blog article write failed", uploadError);
    return NextResponse.json({ error: "Unable to save article" }, { status: 500 });
  }

  if (existing && existing.slug !== nextArticle.slug) {
    const { error: cleanupError } = await admin.storage
      .from(BLOG_CONTENT_BUCKET)
      .remove([blogArticleStoragePath(existing.slug)]);
    if (cleanupError) {
      console.error("ops blog stale draft cleanup failed", cleanupError);
    }
  }

  return NextResponse.json({ article: nextArticle });
}
