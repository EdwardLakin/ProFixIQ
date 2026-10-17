import Link from "next/link";
import EquipmentPager from "@/features/equipment/components/EquipmentPager";
import {
  EquipmentDispatchForm,
  EquipmentVisitAcknowledge,
} from "./EquipmentDispatchActions";
import type { EquipmentDispatchData } from "@/features/equipment/dispatch/server/loadEquipmentDispatch";
import {
  equipmentQueueQuery,
  type EquipmentQueueFilters,
} from "@/features/equipment/lib/equipmentWorkQueue";
import { formatOperationalLabel } from "@/features/work-orders/lib/work-order-status";
import {
  WorkspaceShell,
  WorkspaceHeader,
  WORKSPACE_EYEBROW,
  WORKSPACE_PANEL,
  WORKSPACE_ITEM,
} from "@/features/workspace/components";
const PATH = "/equipment/dispatch";
const BUTTON =
  "inline-flex min-h-11 items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold";
const INPUT =
  "mt-1 min-h-11 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm";
const when = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("en-CA", { timeZone: "UTC" }) + " UTC"
    : "Unscheduled";

export default function EquipmentDispatchView({
  data,
  filters,
  shopId,
  actorId,
  error = false,
}: {
  data?: EquipmentDispatchData;
  filters: EquipmentQueueFilters;
  shopId: string;
  actorId: string;
  error?: boolean;
}) {
  return (
    <WorkspaceShell>
      <WorkspaceHeader className="!static lg:!sticky">
        <p className={WORKSPACE_EYEBROW}>Equipment</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Dispatch</h1>
          <Link className={BUTTON} href={PATH + equipmentQueueQuery(filters)}>
            Refresh board
          </Link>
        </div>
        <p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">
          Equipment service visits, lead and supporting technicians, and field
          dispatch.
        </p>
      </WorkspaceHeader>
      {error || !data ? (
        <section className={`${WORKSPACE_PANEL} p-4`} role="alert">
          Dispatch could not be loaded. Try refreshing the board.
        </section>
      ) : (
        <>
          {data.partial ? (
            <p role="status" className="text-sm">
              Partial data: the Equipment asset or work scan reached its limit.
              Results and work choices may be incomplete.
            </p>
          ) : null}
          <section className={`${WORKSPACE_PANEL} space-y-4 p-4`}>
            <form action={PATH} className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm">
                Active Equipment work order
                <select
                  name="workOrder"
                  defaultValue={data.selected?.id ?? ""}
                  className={INPUT}
                >
                  <option value="">Choose work order</option>
                  {data.work.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title} · {row.assetLabel}
                    </option>
                  ))}
                </select>
              </label>
              <button className={BUTTON}>Prepare dispatch</button>
              <Link href="/equipment/work-orders" className={BUTTON}>
                Work queue
              </Link>
            </form>
            <EquipmentDispatchForm
              key={`${shopId}:${actorId}:${data.selected?.id ?? "none"}`}
              data={{
                selected: data.selected,
                addresses: data.addresses,
                addressesPartial: data.addressesPartial,
                technicians: data.technicians,
                serviceVehicles: data.serviceVehicles,
              }}
              shopId={shopId}
              actorId={actorId}
            />
          </section>
          <section
            className={`${WORKSPACE_PANEL} space-y-4 p-4`}
            aria-label="Equipment visit board"
          >
            <h2 className="font-semibold">Current visits</h2>
            <p className="text-sm text-[color:var(--theme-text-muted)]">
              Unscheduled visits and visits overlapping {when(data.startsAt)}{" "}
              through {when(data.endsAt)}. Completed and cancelled visits are
              excluded. Updated {when(data.generatedAt)}.
            </p>
            <form
              action={PATH}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <label className="text-sm">
                Search
                <input
                  name="q"
                  defaultValue={filters.q}
                  className={INPUT}
                  placeholder="Work number, customer or asset"
                />
              </label>
              <label className="text-sm">
                Asset
                <select
                  name="asset"
                  defaultValue={filters.asset}
                  className={INPUT}
                >
                  <option value="">All Equipment assets</option>
                  {data.assets.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Visit status
                <select
                  name="status"
                  defaultValue={filters.status}
                  className={INPUT}
                >
                  <option value="">All current statuses</option>
                  {[
                    "scheduled",
                    "dispatched",
                    "en_route",
                    "arrived",
                    "working",
                    "paused",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {formatOperationalLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              <button className={`${BUTTON} self-end`}>Apply filters</button>
            </form>
            {!data.items.length ? (
              <p className="text-sm">
                No Equipment visits match this window and filters.
              </p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.items.map((visit) => {
                  const participants = data.participants.filter(
                    (p) => p.service_visit_id === visit.id,
                  );
                  const mine = participants.find((p) => p.user_id === actorId);
                  return (
                    <article
                      key={visit.id}
                      className={`${WORKSPACE_ITEM} space-y-2 p-4`}
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <h3 className="font-semibold">
                          {visit.workOrderNumber || "Service visit"}
                        </h3>
                        <span className="text-sm">
                          {formatOperationalLabel(visit.status)} ·{" "}
                          {visit.mode === "mobile" ? "Field" : "Shop"}
                        </span>
                      </div>
                      <Link
                        className="block py-2 text-sm underline"
                        href={`/equipment/${visit.vehicle!.id}`}
                      >
                        {
                          data.assets.find(
                            ([id]) => id === visit.vehicle!.id,
                          )?.[1]
                        }
                      </Link>
                      <p className="text-sm">
                        {visit.customer?.name || "Customer not set"} ·{" "}
                        {when(visit.scheduledStart)}
                      </p>
                      <p className="text-sm">
                        {visit.serviceAddress
                          ? [
                              visit.serviceAddress.label,
                              visit.serviceAddress.addressLine1,
                              visit.serviceAddress.city,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : "Jobsite not set"}
                      </p>
                      <p className="text-sm">
                        Lead: {visit.assignedTechnician?.name || "Unassigned"} ·
                        Truck: {visit.serviceVehicle?.name || "Unassigned"}
                      </p>
                      {participants.length ? (
                        <ul className="space-y-1 text-sm">
                          {participants.map((p, i) => (
                            <li key={`${p.user_id}:${i}`}>
                              {p.user_id === actorId
                                ? "You"
                                : data.technicians.find(
                                    (t) => t.id === p.user_id,
                                  )?.name ||
                                  (p.user_id === visit.assignedTechnician?.id
                                    ? visit.assignedTechnician.name
                                    : "Technician")}{" "}
                              · {p.role} ·{" "}
                              {p.acknowledged_at
                                ? "Acknowledged"
                                : "Awaiting acknowledgement"}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {visit.dispatchNotes ? (
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {visit.dispatchNotes}
                        </p>
                      ) : null}
                      {mine && !mine.acknowledged_at ? (
                        <EquipmentVisitAcknowledge visitId={visit.id} />
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
            <EquipmentPager
              info={data.info}
              hrefFor={(page) => PATH + equipmentQueueQuery(filters, page)}
            />
            <p className="text-sm text-[color:var(--theme-text-muted)]">
              Visit execution continues in Field. Existing visit assignments and
              schedules are read-only here.
            </p>
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
