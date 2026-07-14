import AiActionApprovalsInboxClient from "@/features/ai/components/AiActionApprovalsInboxClient";
import { requireAdminPageAccess } from "@/features/shared/lib/server/admin-access";

export default async function AiApprovalsPage() {
  await requireAdminPageAccess({ allow: ["owner", "admin", "manager", "advisor"] });

  return (
    <main className="space-y-5">
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-5 py-4 backdrop-blur-xl">
        <p className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">AI Review Center</p>
        <h1 className="mt-1 text-3xl font-semibold text-[color:var(--theme-text-primary)]">AI Approval Inbox</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Review requested AI action previews. Execution remains blocked.</p>
      </section>
      <AiActionApprovalsInboxClient />
    </main>
  );
}
