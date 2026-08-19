import { Suspense } from "react";

import InspectionTemplateEditRouter from "@/features/inspections/components/InspectionTemplateEditRouter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center text-sm text-[color:var(--theme-text-secondary)]">
          Loading inspection template…
        </div>
      }
    >
      <InspectionTemplateEditRouter surface="field" />
    </Suspense>
  );
}
