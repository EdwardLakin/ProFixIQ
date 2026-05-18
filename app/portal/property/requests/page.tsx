import { propertyOperationsTerminology } from "@/features/operations";

export default function PortalPropertyRequestsPage() {
  return (
    <section className="metal-card rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
        {propertyOperationsTerminology.requestPluralLabel}
      </p>
      <h1 className="mt-2 text-2xl text-neutral-100">Coming soon</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">
        Property maintenance request intake and vendor workflow pages are not
        wired yet. This placeholder route prevents broken navigation while the
        branch-aware UI architecture is validated with static data only.
      </p>
    </section>
  );
}
