export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import FeaturePage from "@/features/inspections/app/inspection/custom-inspection/page";

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[320px] items-center justify-center text-sm text-[color:var(--theme-text-secondary)]">
          Loading inspection builder…
        </div>
      }
    >
      <FeaturePage />
    </Suspense>
  );
}
