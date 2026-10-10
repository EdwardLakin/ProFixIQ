import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { slugifyBlogTitle } from "@/features/marketing/blog/types";
import {
  aiBudgetStopResponse,
  isAIBudgetStop,
} from "@/features/shared/lib/server/ai-governance";
import { runOpenAIStructuredJson } from "@/features/shared/lib/server/openai-structured";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINT = "/api/ops/blog/optimize";
const FEATURE = "ops_blog_seo_metadata";

const CATEGORIES = [
  "Founder Notes",
  "Shop Operations",
  "Repair Shop Management",
  "Heavy-Duty Repair",
  "Fleet Maintenance",
  "Field Service",
  "Product Updates",
  "AI & Automation",
  "Industry Insights",
] as const;

const requestSchema = z.object({
  title: z.string().trim().min(3).max(180),
  bodyMarkdown: z.string().trim().min(80).max(30_000),
});

const modelMetadataSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  category: z.enum(CATEGORIES),
  excerpt: z.string().trim().min(40).max(260),
  seoTitle: z.string().trim().min(20).max(90),
  seoDescription: z.string().trim().min(70).max(240),
});

const responseMetadataSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  category: z.enum(CATEGORIES),
  excerpt: z.string().trim().min(40).max(220),
  seoTitle: z.string().trim().min(20).max(65),
  seoDescription: z.string().trim().min(70).max(170),
});

type SeoMetadata = z.infer<typeof responseMetadataSchema>;

function clipAtWord(value: string, maxLength: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;

  const slice = trimmed.slice(0, maxLength + 1);
  const boundary = slice.lastIndexOf(" ");
  const clipped = boundary >= Math.floor(maxLength * 0.7)
    ? slice.slice(0, boundary)
    : trimmed.slice(0, maxLength);

  return clipped.replace(/[\s,;:\-–—]+$/g, "").trim();
}

function normalizeSlug(value: string, fallbackTitle: string): string {
  const normalized = slugifyBlogTitle(value) || slugifyBlogTitle(fallbackTitle);
  const words = normalized.split("-").filter(Boolean).slice(0, 8);
  return words.join("-").slice(0, 80).replace(/-+$/g, "");
}

export async function POST(request: Request): Promise<NextResponse> {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Add a title and enough article content before optimizing." },
      { status: 400 },
    );
  }

  try {
    const result = await runOpenAIStructuredJson<z.infer<typeof modelMetadataSchema>>({
      purpose: "fast",
      feature: FEATURE,
      schemaName: "ops_blog_seo_metadata",
      requireAI: true,
      temperature: 0.2,
      maxOutputTokens: 500,
      timeoutMs: 15_000,
      telemetry: {
        endpoint: ENDPOINT,
        shopId: access.profile?.shop_id ?? null,
        userId: access.user.id,
      },
      system: [
        "You are the SEO metadata editor for ProFixIQ, repair shop management software used across automotive, heavy-duty, fleet, and field-service operations.",
        "Read the supplied article title and Markdown body and return metadata only; never rewrite the article body.",
        "The article itself is the source of truth. Never invent product capabilities, integrations, pricing, performance results, customer claims, or facts that are not supported by the article.",
        "Optimize for relevant organic search intent and search-result click-through without keyword stuffing, hype, or repetitive wording.",
        "Return a JSON object with exactly: slug, category, excerpt, seoTitle, seoDescription.",
        `category must be exactly one of: ${CATEGORIES.join(", ")}.`,
        "slug should be concise lowercase words separated by hyphens, normally 3-8 words, with no dates unless the article is date-specific.",
        "excerpt should be a natural 120-200 character resource-card summary that accurately states why the article is useful.",
        "seoTitle should normally be 45-60 characters, front-load the most useful search phrase when natural, and avoid clickbait.",
        "seoDescription should normally be 140-160 characters, summarize the article accurately, and give a searcher a concrete reason to read it.",
        "Do not include keyword lists, explanations, Markdown, or commentary outside the JSON object.",
      ].join(" "),
      user: {
        title: parsed.data.title,
        bodyMarkdown: parsed.data.bodyMarkdown,
      },
      validate: (candidate) => modelMetadataSchema.parse(candidate),
      fallback: () => ({
        slug: slugifyBlogTitle(parsed.data.title),
        category: "Industry Insights",
        excerpt: parsed.data.title,
        seoTitle: parsed.data.title,
        seoDescription: parsed.data.title,
      }),
    });

    const candidate = result.output;
    const metadata: SeoMetadata = responseMetadataSchema.parse({
      slug: normalizeSlug(candidate.slug, parsed.data.title),
      category: candidate.category,
      excerpt: clipAtWord(candidate.excerpt, 220),
      seoTitle: clipAtWord(candidate.seoTitle, 65),
      seoDescription: clipAtWord(candidate.seoDescription, 170),
    });

    return NextResponse.json({ metadata });
  } catch (error) {
    if (isAIBudgetStop(error)) {
      const stop = aiBudgetStopResponse(error);
      return NextResponse.json(stop.body, { status: stop.status });
    }

    console.error("ops blog metadata optimization failed", error);
    return NextResponse.json(
      { error: "Could not optimize this article right now. Nothing was changed." },
      { status: 502 },
    );
  }
}
