"use client";

import { Suspense } from "react";
import FeaturePage from "@/features/dashboard/app/dashboard/owner/settings/page";
import BrandStudioCard from "@/features/branding/components/BrandStudioCard";

export default function Page() {
  <BrandStudioCard />

return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
