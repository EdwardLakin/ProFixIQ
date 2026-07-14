import AiRecommendationsReviewClient from "@/features/ai/components/AiRecommendationsReviewClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";
import Link from "next/link";

export default async function AiRecommendationsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager", "advisor"] });

  return (
    <main className="space-y-5">
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-4 backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">AI Review Center</p>
        <h1 className="mt-1 text-3xl font-semibold text-[color:var(--theme-text-primary)]">AI Recommendations</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Evidence-backed operating signals awaiting review</p>
        <div className="mt-3">
          <Link href="/dashboard/ai-approvals" className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20">
            Approval inbox
          </Link>
        </div>
      </section>
      <AiRecommendationsReviewClient />
    </main>
  );
}
