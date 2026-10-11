/* eslint-disable @next/next/no-img-element */
"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { BlogArticleInput } from "@/features/marketing/blog/types";

function readingTime(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export default function BlogArticlePreview({ article }: { article: BlogArticleInput }) {
  return (
    <div className="pfq-marketing overflow-hidden rounded-2xl border border-[color:var(--marketing-border)] bg-white text-[color:var(--marketing-ink)] shadow-sm">
      <header className="border-b border-[color:var(--marketing-border)] px-6 py-8 sm:px-8">
        <div className="marketing-eyebrow">{article.category || "Category"}</div>
        <h1 className="mt-4 text-3xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-4xl">
          {article.title || "Article title"}
        </h1>
        <p className="mt-5 text-lg leading-8 text-[color:var(--marketing-muted)]">
          {article.excerpt || "Your article excerpt will appear here."}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[color:var(--marketing-muted)]">
          <span className="font-bold text-[color:var(--marketing-ink)]">
            {article.authorName || "Author"}
          </span>
          {article.authorTitle ? <><span aria-hidden="true">•</span><span>{article.authorTitle}</span></> : null}
          <span aria-hidden="true">•</span>
          <span>{readingTime(article.bodyMarkdown)} min read</span>
        </div>
      </header>

      {article.heroImageUrl ? (
        <div className="px-6 pt-6 sm:px-8">
          <img
            src={article.heroImageUrl}
            alt={article.heroImageAlt ?? ""}
            className="w-full rounded-2xl border border-[color:var(--marketing-border)] object-cover"
          />
        </div>
      ) : null}

      <div className="px-6 py-8 sm:px-8">
        <div className="prose prose-slate max-w-none prose-headings:tracking-[-0.035em] prose-headings:text-[color:var(--marketing-ink)] prose-p:text-[color:var(--marketing-muted)] prose-p:leading-8 prose-a:text-[color:var(--marketing-copper-dark)] prose-strong:text-[color:var(--marketing-ink)] prose-img:rounded-2xl prose-img:border prose-img:border-[color:var(--marketing-border)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {article.bodyMarkdown || "Nothing to preview yet."}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
