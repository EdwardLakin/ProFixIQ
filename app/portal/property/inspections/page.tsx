import { propertyOperationsTerminology } from "@/features/operations";

export default function PortalPropertyInspectionsPage() {
  return (
    <section className="metal-card rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
        {propertyOperationsTerminology.inspectionPluralLabel}
      </p>
      <h1 className="mt-2 text-2xl text-neutral-100">Coming soon</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">
        Property inspection history is a static placeholder in this step. No
        tenant auth, vendor auth, request conversion, schema, RLS, or live
        inspection storage has been added.
      </p>
    </section>
  );
}
