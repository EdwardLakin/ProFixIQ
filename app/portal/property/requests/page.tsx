import { propertyOperationsTerminology } from "@/features/operations";

export default function PortalPropertyRequestsPage() {
  return (
    <section className="metal-card rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
        {propertyOperationsTerminology.requestPluralLabel}
      </p>
      <h1 className="mt-2 text-2xl text-[color:var(--theme-text-primary)]">Coming soon</h1>
      <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
        Property maintenance request intake and vendor workflow pages are not
        wired yet. This placeholder route prevents broken navigation while the
        branch-aware UI architecture is validated with static data only.
      </p>
    </section>
  );
}
