"use client";

import dynamic from "next/dynamic";

// Lazy-load both to avoid SSR hiccups and cut JS on pages that don’t use them
const TechAssistant = dynamic(
  () => import("@/features/shared/components/TechAssistant"),
  { ssr: false }
);
const TechAssistantMobile = dynamic(
  () => import("@/features/shared/components/TechAssistantMobile"),
  { ssr: false }
);

export default function TechAssistantPage() {
  // If you want to seed defaults later, keep these; for now we pass nothing.
  const defaultVehicle: { year?: string; make?: string; model?: string } | undefined = undefined;
  const workOrderLineId: string | undefined = undefined;

  return (
    <div className="mx-auto w-full max-w-5xl p-3 sm:p-4 md:p-6 text-white">
      <h1 className="mb-3 text-lg font-header text-orange-500">Tech Assistant</h1>

      {/* Mobile */}
      <div className="md:hidden rounded border border-neutral-800 bg-neutral-900">
        <TechAssistantMobile
          defaultVehicle={defaultVehicle}
          workOrderLineId={workOrderLineId}
        />
      </div>

      {/* Desktop / tablet */}
      <div className="hidden md:block rounded border border-neutral-800 bg-neutral-900 p-3">
        <TechAssistant
          defaultVehicle={defaultVehicle}
          workOrderLineId={workOrderLineId}
        />
      </div>
    </div>
  );
}