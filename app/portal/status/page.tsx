"use client";

import WorkOrderBoard from "@shared/components/workboard/WorkOrderBoard";

export default function PortalStatusPage() {
  return (
    <main className="min-h-screen px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-[1500px]">
        <WorkOrderBoard
          variant="portal"
          title="Live repair status"
          subtitle="Track progress, approvals, and readiness in real time."
        />
      </div>
    </main>
  );
}
