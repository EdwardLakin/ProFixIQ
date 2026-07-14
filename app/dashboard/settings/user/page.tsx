"use client";

import { Suspense } from "react";
import FeaturePage from "@/features/dashboard/app/dashboard/settings/user/page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-[color:var(--theme-text-primary)]">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
