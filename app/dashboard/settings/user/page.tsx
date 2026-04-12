"use client";

import { Suspense } from "react";
import FeaturePage from "@/features/dashboard/app/dashboard/settings/user/page";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <FeaturePage />
    </Suspense>
  );
}
