/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Footer from "@shared/components/ui/Footer";
import ResourceCard from "@/features/marketing/blog/ResourceCard";
import ResourceHeader from "@/features/marketing/blog/ResourceHeader";
import {
  getPublishedBlogArticleBySlug,
  listPublishedBlogArticles,
} from "@/features/marketing/blog/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ slug: string }> };

function readableDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function readingTime(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedBlogArticleBySlug(slug);
  if (!article) return { title: "Resource Not Found | ProFixIQ" };

  const title = article.seoTitle || `${article.title} | ProFixIQ`;
  const description = article.seoDescription || article.excerpt;
  const canonical = `/resources/${article.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt,
      authors: [article.authorName],
      images: article.heroImageUrl ? [{ url: article.heroImageUrl, alt: article.heroImageAlt ?? article.title }] : undefined,
    },
  };
}

export default async function ResourceArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getPublishedBlogArticleBySlug(slug);
  if (!article) notFound();

  const related = (await listPublishedBlogArticles(6))
    .filter((item) => item.id !== article.id)
    .slice(0, 3);
  const published = readableDate(article.publishedAt ?? article.updatedAt);
  const canonical = `https://profixiq.com/resources/${article.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.seoDescription || article.excerpt,
    datePublished: article.publishedAt ?? article.updatedAt,
    dateModified: article.updatedAt,
    author: { "@type": "Person", name: article.authorName },
    publisher: {
      "@type": "Organization",
      name: "ProFixIQ",
      url: "https://profixiq.com",
    },
    mainEntityOfPage: canonical,
    image: article.heroImageUrl ?? undefined,
  };

  return (
    <div className="pfq-marketing min-h-screen bg-[color:var(--marketing-bg)] text-[color:var(--marketing-ink)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
      <ResourceHeader />
      <main>
        <article>
          <header className="border-b border-[color:var(--marketing-border)] bg-white py-14 sm:py-20">
            <div className="mx-auto max-w-4xl px-5 sm:px-8">
              <Link href="/resources" className="inline-flex items-center gap-2 text-sm font-bold text-[color:var(--marketing-copper-dark)]">
                <ArrowLeft size={15} /> All resources
              </Link>
              <div className="marketing-eyebrow mt-10">{article.category}</div>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-6xl">{article.title}</h1>
              <p className="mt-6 text-xl leading-8 text-[color:var(--marketing-muted)]">{article.excerpt}</p>
              <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[color:var(--marketing-muted)]">
                <span className="font-bold text-[color:var(--marketing-ink)]">{article.authorName}</span>
                {article.authorTitle ? <><span aria-hidden="true">•</span><span>{article.authorTitle}</span></> : null}
                {published ? <><span aria-hidden="true">•</span><time dateTime={article.publishedAt ?? article.updatedAt}>{published}</time></> : null}
                <span aria-hidden="true">•</span>
                <span>{readingTime(article.bodyMarkdown)} min read</span>
              </div>
            </div>
          </header>

          {article.heroImageUrl ? (
            <div className="mx-auto max-w-6xl px-5 pt-10 sm:px-8 sm:pt-14">
              <img src={article.heroImageUrl} alt={article.heroImageAlt ?? ""} className="w-full rounded-2xl border border-[color:var(--marketing-border)] object-cover shadow-sm" />
            </div>
          ) : null}

          <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
            <div className="prose prose-slate max-w-none prose-headings:tracking-[-0.035em] prose-headings:text-[color:var(--marketing-ink)] prose-p:text-[color:var(--marketing-muted)] prose-p:leading-8 prose-a:text-[color:var(--marketing-copper-dark)] prose-strong:text-[color:var(--marketing-ink)] prose-img:rounded-2xl prose-img:border prose-img:border-[color:var(--marketing-border)]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{article.bodyMarkdown}</ReactMarkdown>
            </div>
          </div>
        </article>

        <section className="border-y border-[color:var(--marketing-border)] bg-[color:var(--marketing-ink)] py-14 text-white sm:py-16">
          <div className="mx-auto flex max-w-4xl flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div><div className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--marketing-copper-light)]">See ProFixIQ in action</div><h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">See how the workflow fits your shop.</h2></div>
            <div className="flex flex-wrap gap-3">
              <Link href="/request-demo" className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold">Request demo</Link>
              <Link href="/compare-plans" className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--marketing-copper)] px-4 py-3 text-sm font-bold">Start free trial <ArrowRight size={15} /></Link>
            </div>
          </div>
        </section>

        {related.length > 0 ? (
          <section className="py-16 sm:py-20">
            <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
              <div className="marketing-eyebrow">Keep reading</div>
              <h2 className="marketing-heading mt-4">More from ProFixIQ</h2>
              <div className="mt-10 grid gap-5 lg:grid-cols-3">
                {related.map((item) => <ResourceCard key={item.id} article={item} />)}
              </div>
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
