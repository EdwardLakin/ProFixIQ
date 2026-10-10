import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BlogArticleInputSchema,
  slugifyBlogTitle,
} from "@/features/marketing/blog/types";

const read = (path: string) => readFileSync(path, "utf8");
const migrationPath = "supabase/migrations/20261010163000_ops_blog_storage.sql";

describe("Ops blog CMS", () => {
  it("provisions isolated blog storage without changing public application schema", () => {
    const migration = read(migrationPath);
    expect(migration).toContain("'marketing-blog-content'");
    expect(migration).toContain("'marketing-blog-media'");
    expect(migration).toContain("false,\n  1048576");
    expect(migration).toContain("true,\n  10485760");
    expect(migration).not.toMatch(/create\s+table\s+public\./i);
    expect(migration).not.toMatch(/alter\s+table\s+public\./i);
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\./i);
  });

  it("keeps blog mutations behind canonical Ops operator authorization", () => {
    const articlesRoute = read("app/api/ops/blog/articles/route.ts");
    const mediaRoute = read("app/api/ops/blog/media/route.ts");
    const optimizeRoute = read("app/api/ops/blog/optimize/route.ts");

    for (const source of [articlesRoute, mediaRoute]) {
      const auth = source.indexOf("await requireOpsOperatorApiAccess()");
      const admin = source.indexOf("const admin = createAdminSupabase()");
      expect(auth).toBeGreaterThan(-1);
      expect(admin).toBeGreaterThan(auth);
    }

    const optimizeAuth = optimizeRoute.indexOf("await requireOpsOperatorApiAccess()");
    const optimizeAI = optimizeRoute.indexOf("await runOpenAIStructuredJson");
    expect(optimizeAuth).toBeGreaterThan(-1);
    expect(optimizeAI).toBeGreaterThan(optimizeAuth);

    expect(mediaRoute).toContain("MAX_IMAGE_BYTES = 10 * 1024 * 1024");
    expect(mediaRoute).not.toContain('"image/svg+xml"');
  });

  it("allows incomplete drafts but keeps public publishing requirements server-side", () => {
    const articlesRoute = read("app/api/ops/blog/articles/route.ts");
    const draft = BlogArticleInputSchema.safeParse({
      title: "Started draft",
      slug: "started-draft",
      excerpt: "",
      bodyMarkdown: "",
      authorName: "Edward Lakin",
      authorTitle: "Founder, ProFixIQ",
      category: "Founder Notes",
      heroImageUrl: null,
      heroImageAlt: null,
      seoTitle: "",
      seoDescription: "",
      status: "draft",
      featured: false,
    });

    expect(draft.success).toBe(true);
    expect(articlesRoute).toContain('parsed.data.status === "published"');
    expect(articlesRoute).toContain('"article body"');
    expect(articlesRoute).toContain("before publishing");
  });

  it("exposes only explicitly published documents on public resource paths", () => {
    const server = read("features/marketing/blog/server.ts");
    const latest = read("app/api/resources/latest/route.ts");
    const articlePage = read("app/resources/[slug]/page.tsx");

    expect(server).toContain('article.status === "published"');
    expect(server).toContain('article.status !== "published"');
    expect(latest).toContain("listPublishedBlogArticles(3)");
    expect(articlePage).toContain("getPublishedBlogArticleBySlug");
    expect(articlePage).toContain('"@type": "Article"');
    expect(articlePage).not.toContain("rehypeRaw");
  });

  it("wires resources into public navigation, shell boundaries, homepage highlights, and sitemap", () => {
    const shellBoundaries = read("features/shared/lib/routes/shellBoundaries.ts");
    const footer = read("features/shared/components/ui/Footer.tsx");
    const sitemap = read("app/sitemap.xml/route.ts");
    const opsShell = read("features/ops/components/OpsShell.tsx");

    expect(shellBoundaries).toContain('"/resources"');
    expect(footer).toContain('label: "Resources", href: "/resources"');
    expect(footer).toContain("<HomeResourceHighlights />");
    expect(sitemap).toContain('{ path: "/resources", changeFrequency: "weekly", priority: 0.8 }');
    expect(sitemap).toContain("listPublishedBlogArticles");
    expect(opsShell).toContain('{ href: "/ops/blog", label: "Blog", icon: BookOpen }');
  });

  it("provides a self-service Markdown editor with draft, preview, image, AI optimization, and publish controls", () => {
    const editor = read("features/ops/components/OpsBlogManager.tsx");
    expect(editor).toContain("<ReactMarkdown");
    expect(editor).toContain("Live preview");
    expect(editor).toContain("Add image to article");
    expect(editor).toContain("Optimize with AI");
    expect(editor).toContain('/api/ops/blog/optimize');
    expect(editor).toContain("AI suggestions applied. Review them before saving or publishing.");
    expect(editor).toContain("Save draft");
    expect(editor).toContain("Publish");
    expect(editor).toContain("Unpublish & save draft");
  });

  it("uses the article as source of truth and returns reviewable SEO metadata without auto-saving", () => {
    const optimizeRoute = read("app/api/ops/blog/optimize/route.ts");

    expect(optimizeRoute).toContain('const FEATURE = "ops_blog_seo_metadata"');
    expect(optimizeRoute).toContain("runOpenAIStructuredJson");
    expect(optimizeRoute).toContain("requireAI: true");
    expect(optimizeRoute).toContain("maxOutputTokens: 500");
    expect(optimizeRoute).toContain("The article itself is the source of truth");
    expect(optimizeRoute).toContain("Never invent product capabilities");
    expect(optimizeRoute).toContain("seoTitle");
    expect(optimizeRoute).toContain("seoDescription");
    expect(optimizeRoute).toContain("slugifyBlogTitle");
    expect(optimizeRoute).not.toContain("listBlogArticlesForOps");
    expect(optimizeRoute).not.toContain(".upload(");
  });

  it("normalizes safe public slugs and validates the authoring contract", () => {
    expect(slugifyBlogTitle("Why I Built ProFixIQ! ")).toBe("why-i-built-profixiq");
    expect(
      BlogArticleInputSchema.safeParse({
        title: "Why I Built ProFixIQ",
        slug: "why-i-built-profixiq",
        excerpt: "Founder story",
        bodyMarkdown: "## The story\n\nBody",
        authorName: "Edward Lakin",
        authorTitle: "Founder, ProFixIQ",
        category: "Founder Notes",
        heroImageUrl: null,
        heroImageAlt: null,
        seoTitle: "",
        seoDescription: "",
        status: "draft",
        featured: true,
      }).success,
    ).toBe(true);
    expect(
      BlogArticleInputSchema.safeParse({
        title: "Unsafe",
        slug: "../unsafe",
        excerpt: "No",
        bodyMarkdown: "No",
        authorName: "Author",
        authorTitle: "",
        category: "Test",
        heroImageUrl: null,
        heroImageAlt: null,
        seoTitle: "",
        seoDescription: "",
        status: "draft",
        featured: false,
      }).success,
    ).toBe(false);
  });
});
