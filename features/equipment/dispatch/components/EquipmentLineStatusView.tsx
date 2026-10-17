import Link from "next/link";

import {
  WORKER_STATE_LABEL,
  type LineView,
} from "@/features/equipment/dispatch/lib/lineStatus";
import type { EquipmentLineStatus } from "@/features/equipment/dispatch/server/loadLineStatus";
import {
  EquipmentCloseLineForm,
  EquipmentPunchOffForm,
} from "@/features/equipment/dispatch/components/EquipmentLineActions";
import {
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

export default function EquipmentLineStatusView({
  status,
  view,
}: {
  status: EquipmentLineStatus;
  view: LineView;
}) {
  const { line } = status;
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment · Job line</p>
        <h1 className="mt-1 text-2xl font-bold">{line.title}</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
          {view.closed ? "This line is complete." : "Punch off here when you finish your part of the job."}
          {line.workOrderId ? (
            <>
              {" "}
              <Link className="font-semibold underline" href={`/work-orders/${line.workOrderId}`}>
                Open work order
              </Link>
            </>
          ) : null}
        </p>
      </WorkspaceHeader>

      <section className={`${ITEM} p-4`} aria-label="Who is working this line">
        <h2 className="text-base font-semibold">On this job</h2>
        {view.workers.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">Nobody has logged time yet.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {view.workers.map((worker) => (
              <li key={worker.technicianId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{status.names[worker.technicianId] ?? "Technician"}</span>
                <span className="text-[color:var(--theme-text-muted)]">{WORKER_STATE_LABEL[worker.state]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view.canPunchOff ? (
        <EquipmentPunchOffForm
          lineId={line.id}
          closesLine={view.punchOffClosesLine}
          initialCause={line.cause}
          initialCorrection={line.correction}
        />
      ) : null}

      {view.canOfficeClose ? (
        <EquipmentCloseLineForm lineId={line.id} initialCause={line.cause} initialCorrection={line.correction} />
      ) : view.officeCloseBlockedReason && !view.closed ? (
        <p className="text-sm text-[color:var(--theme-text-muted)]">
          Office close is not available: {view.officeCloseBlockedReason}
        </p>
      ) : null}
    </WorkspaceShell>
  );
}
