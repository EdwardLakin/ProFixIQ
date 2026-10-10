"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import ResourceCard from "./ResourceCard";
import type { BlogArticleSummary } from "./types";

export default function HomeResourceHighlights() {
  const pathname = usePathname();
  const [articles, setArticles] = useState<BlogArticleSummary[]>([]);

  useEffect(() => {
    if (pathname !== "/") return;
    let active = true;

    void fetch("/api/resources/latest", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load resources");
        return (await response.json()) as { articles?: BlogArticleSummary[] };
      })
      .then((payload) => {
        if (active) setArticles(payload.articles ?? []);
      })
      .catch(() => {
        if (active) setArticles([]);
      });

    return () => {
      active = false;
    };
  }, [pathname]);

  if (pathname !== "/" || articles.length === 0) return null;

  return (
    <section className="pfq-marketing border-t border-[color:var(--marketing-border)] bg-[color:var(--marketing-bg)] py-20 text-[color:var(--marketing-ink)] sm:py-24">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="marketing-eyebrow">From the shop floor</div>
            <h2 className="marketing-heading mt-4 max-w-3xl">Repair-shop ideas, workflow lessons, and what we’re building.</h2>
          </div>
          <Link href="/resources" className="inline-flex items-center gap-2 text-sm font-bold text-[color:var(--marketing-copper-dark)]">
            View all resources <ArrowRight size={15} />
          </Link>
        </div>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {articles.map((article) => <ResourceCard key={article.id} article={article} />)}
        </div>
      </div>
    </section>
  );
}
