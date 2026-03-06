"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import WorkOrderBoard from "@shared/components/workboard/WorkOrderBoard";

export default function FleetBoardPage() {
  const params = useParams();
  const fleetId = useMemo(() => {
    const raw = params?.fleetId;
    return typeof raw === "string" ? raw : null;
  }, [params]);

  return (
    <main className="min-h-screen px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-[1500px]">
        <WorkOrderBoard
          variant="fleet"
          fleetId={fleetId}
          title="Fleet live board"
          subtitle="Read-only live board for units in service, approvals, and parts blockers."
        />
      </div>
    </main>
  );
}
