import { propertyOperationsTerminology } from "@/features/operations";

export default function PortalPropertyInspectionsPage() {
  return (
    <section className="metal-card rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-muted)]">
        {propertyOperationsTerminology.inspectionPluralLabel}
      </p>
      <h1 className="mt-2 text-2xl text-[color:var(--theme-text-primary)]">Coming soon</h1>
      <p className="mt-2 max-w-2xl text-sm text-[color:var(--theme-text-secondary)]">
        Property inspection history is a static placeholder in this step. No
        tenant auth, vendor auth, request conversion, schema, RLS, or live
        inspection storage has been added.
      </p>
    </section>
  );
}
