import EquipmentPager from "@/features/equipment/components/EquipmentPager";
import { paginate } from "@/features/equipment/lib/equipmentDirectoryQuery";
import Link from "next/link";
import type { loadEquipmentFieldVisits } from "@/features/equipment/server/loadEquipmentFieldVisits";
import { formatOperationalLabel } from "@/features/work-orders/lib/work-order-status";
import {
  WorkspaceShell,
  WorkspaceHeader,
  WorkspaceEmptyState,
  WORKSPACE_ITEM,
} from "@/features/workspace/components";

export default function EquipmentFieldVisitsView({
  data,
  page = 1,
}: {
  data: Awaited<ReturnType<typeof loadEquipmentFieldVisits>>;
  page?: number;
}) {
  const { items, info } = paginate(data.rows, page);
  return (
    <WorkspaceShell>
      <WorkspaceHeader className="!static lg:!sticky">
        <h1 className="text-2xl font-bold">Active field visits</h1>
        <p className="mt-2 text-sm">
          Scheduled through paused mobile visits for Equipment assets, including
          unscheduled visits.
        </p>
        <p className="mt-2 text-sm">
          Dispatch window: {data.window.startsAt} to {data.window.endsAt} (UTC).
        </p>
        <Link
          href="/equipment/dashboard"
          className="mt-3 inline-flex min-h-11 items-center"
        >
          Back to dashboard
        </Link>
      </WorkspaceHeader>
      {data.partial ? (
        <p role="status">
          Incomplete: only visits for the scanned Equipment assets are included
          (up to 5,000 assets).
        </p>
      ) : null}
      <p>
        {data.rows.length} matching visits
        {data.partial ? " in this scan" : " in this window"}
      </p>
      {data.rows.length ? (
        <ul className="grid gap-3">
          {items.map((visit) => (
            <li key={visit.id} className={`${WORKSPACE_ITEM} p-4`}>
              <h2 className="font-semibold">
                {visit.vehicle?.label ?? "Equipment asset"}
              </h2>
              <p>
                {formatOperationalLabel(visit.status)} ·{" "}
                {visit.workOrderNumber ?? "Service visit"}
              </p>
              <p>{visit.scheduledStart ?? "Unscheduled"}</p>
              <Link
                href={`/equipment/${visit.vehicle!.id}`}
                className="inline-flex min-h-11 items-center"
              >
                Open asset
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <WorkspaceEmptyState>
          No active Equipment field visits in this Dispatch window.
        </WorkspaceEmptyState>
      )}
      <EquipmentPager
        info={info}
        hrefFor={(page) =>
          `/equipment/dashboard/field-visits?${new URLSearchParams({ ...data.window, page: String(page) })}`
        }
      />
    </WorkspaceShell>
  );
}
