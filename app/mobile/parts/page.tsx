import MobilePartsWorkflow from "@/features/parts/mobile/MobilePartsWorkflow";

export const dynamic = "force-dynamic";

export default function MobilePartsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 overflow-x-hidden px-3 py-3 sm:px-4">
      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
          Parts
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-[color:var(--theme-text-primary)]">
          Parts workflow
        </h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
          Review requests, receive approved parts, and allocate ready inventory
          without leaving the mobile workspace.
        </p>
      </section>

      <MobilePartsWorkflow />
    </div>
  );
}
