import type { Metadata } from "next";
import Footer from "@shared/components/ui/Footer";
import ResourceCard from "@/features/marketing/blog/ResourceCard";
import ResourceHeader from "@/features/marketing/blog/ResourceHeader";
import { listPublishedBlogArticles } from "@/features/marketing/blog/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Repair Shop Resources | ProFixIQ",
  description:
    "Practical repair-shop workflow, heavy-duty service, fleet maintenance, field service, and product insights from ProFixIQ.",
  alternates: { canonical: "/resources" },
  openGraph: {
    title: "Repair Shop Resources | ProFixIQ",
    description:
      "Practical repair-shop workflow, heavy-duty service, fleet maintenance, field service, and product insights from ProFixIQ.",
    url: "/resources",
  },
};

export default async function ResourcesPage() {
  const articles = await listPublishedBlogArticles();

  return (
    <div className="pfq-marketing min-h-screen bg-[color:var(--marketing-bg)] text-[color:var(--marketing-ink)]">
      <ResourceHeader />
      <main>
        <section className="border-b border-[color:var(--marketing-border)] bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            <div className="marketing-eyebrow">Resources</div>
            <h1 className="marketing-heading mt-4 max-w-4xl">From the shop floor.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-[color:var(--marketing-muted)]">
              Practical thoughts on repair-shop workflow, heavy-duty service, technology, and what we’re building at ProFixIQ.
            </p>
          </div>
        </section>
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
            {articles.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {articles.map((article) => <ResourceCard key={article.id} article={article} />)}
              </div>
            ) : (
              <div className="rounded-2xl border border-[color:var(--marketing-border)] bg-white p-8 text-[color:var(--marketing-muted)]">
                New resources are being prepared. Check back soon.
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
