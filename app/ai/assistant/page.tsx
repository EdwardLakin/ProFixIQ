"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// Lazy to avoid SSR hiccups
const TechAssistant = dynamic(
  () => import("@/features/shared/components/TechAssistant"),
  { ssr: false }
);

export default function TechAssistantPage() {
  // Optional: seed vehicle or WO line here if you want
  const [vehicle] = useState<{ year?: string; make?: string; model?: string } | null>(null);
  const [workOrderLineId] = useState<string | null>(null);

  return (
    <div className="p-4 text-white">
      <h1 className="mb-3 text-lg font-semibold text-neutral-300">Tech Assistant</h1>
      <div className="rounded border border-neutral-800 bg-neutral-900 p-3">
        <TechAssistant
          defaultVehicle={vehicle ?? undefined}
          workOrderLineId={workOrderLineId ?? undefined}
        />
      </div>
    </div>
  );
}