/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { BlogArticleSummary } from "./types";

function publishedLabel(article: BlogArticleSummary): string {
  const value = article.publishedAt ?? article.updatedAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
}

export default function ResourceCard({ article }: { article: BlogArticleSummary }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-[color:var(--marketing-border)] bg-white shadow-sm">
      {article.heroImageUrl ? (
        <img
          src={article.heroImageUrl}
          alt={article.heroImageAlt ?? ""}
          className="aspect-[16/9] w-full object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-[color:var(--marketing-copper-dark)]">
          <span>{article.category}</span>
          {publishedLabel(article) ? (
            <>
              <span aria-hidden="true">•</span>
              <span className="text-[color:var(--marketing-muted)]">{publishedLabel(article)}</span>
            </>
          ) : null}
        </div>
        <h3 className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-[color:var(--marketing-ink)]">
          <Link href={`/resources/${article.slug}`} className="transition hover:text-[color:var(--marketing-copper-dark)]">
            {article.title}
          </Link>
        </h3>
        <p className="mt-3 flex-1 text-sm leading-6 text-[color:var(--marketing-muted)]">
          {article.excerpt}
        </p>
        <Link
          href={`/resources/${article.slug}`}
          className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[color:var(--marketing-copper-dark)]"
        >
          Read article <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}
