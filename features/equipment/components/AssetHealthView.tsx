import Link from "next/link";

import EquipmentAssetProfilePanel from "@/features/equipment/components/EquipmentAssetProfilePanel";
import { ASSET_OPERATING_STATUS_LABELS } from "@/features/equipment/lib/assetProfile";
import type { AssetHealth } from "@/features/equipment/server/loadAssetHealth";
import type {
  VehicleWorkspacePermissions,
  VehicleWorkspaceReference,
} from "@/features/vehicles/lib/vehicleWorkspace";
import {
  WorkspaceEmptyState as EmptyState,
  WorkspaceHeader,
  WorkspaceSection,
  WorkspaceShell,
  WorkspaceStatus,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_ITEM as ITEM,
} from "@/features/workspace/components";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function display(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

/** Link only to sources the viewer's role may open (mirrors the vehicle workspace). */
function referenceHref(
  reference: VehicleWorkspaceReference,
  permissions: VehicleWorkspacePermissions,
): string | null {
  if (!reference.href) return null;
  switch (reference.sourceType) {
    case "work_order":
    case "work_order_line":
    case "maintenance_suggestion":
      return permissions.canOpenWorkOrders ? reference.href : null;
    case "inspection":
      return permissions.canOpenInspections ? reference.href : null;
    case "appointment":
      return permissions.canOpenAppointments ? reference.href : null;
    default:
      return null;
  }
}

function SourceLink({
  reference,
  permissions,
  children,
}: {
  reference: VehicleWorkspaceReference;
  permissions: VehicleWorkspacePermissions;
  children: React.ReactNode;
}) {
  const href = referenceHref(reference, permissions);
  return href ? (
    <Link href={href} className="font-semibold hover:underline">
      {children}
    </Link>
  ) : (
    <span className="font-semibold">{children}</span>
  );
}

function ComingNext({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-sm text-[color:var(--theme-text-muted)]">{children}</p>
  );
}

/**
 * Asset Health: the neutral record of everything ProFixIQ knows about one
 * machine. Facts only — it surfaces recorded evidence; the technician makes
 * the diagnosis and repair decision.
 */
export default function AssetHealthView({ health }: { health: AssetHealth }) {
  const { snapshot, equipment, attachments, host } = health;
  const { identity, permissions } = snapshot;
  const profile = equipment.profile;
  const title =
    [
      identity.unitNumber ? `Unit ${identity.unitNumber}` : null,
      [identity.year, identity.make, identity.model].filter(Boolean).join(" ") || null,
    ]
      .filter(Boolean)
      .join(" · ") || "Asset";

  const defects = snapshot.attentionItems.filter(
    (item) => item.kind === "failed_inspection" || item.kind === "unresolved_concern",
  );
  const pmItems = snapshot.attentionItems.filter((item) => item.kind === "maintenance_due");
  const otherAttention = snapshot.attentionItems.filter(
    (item) => item.kind === "deferred_work" || item.kind === "waiting_parts",
  );
  const nextAppointment = snapshot.upcomingAppointments[0] ?? null;

  return (
    <WorkspaceShell>
      {/* 1. Machine identity */}
      <WorkspaceHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={EYEBROW}>Asset Health</p>
            <h1 className="mt-1 text-2xl font-bold">{title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile ? <WorkspaceStatus>{profile.equipmentClassLabel}</WorkspaceStatus> : null}
              {profile ? (
                <WorkspaceStatus>
                  {ASSET_OPERATING_STATUS_LABELS[profile.operatingStatus]}
                </WorkspaceStatus>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-[color:var(--theme-text-muted)]">Customer</dt>
              <dd>{display(snapshot.currentAccount?.displayName)}</dd>
              <dt className="text-[color:var(--theme-text-muted)]">Site</dt>
              <dd>{display(profile?.siteName)}</dd>
              <dt className="text-[color:var(--theme-text-muted)]">Serial</dt>
              <dd>{display(profile?.serialNumber)}</dd>
              <dt className="text-[color:var(--theme-text-muted)]">PIN / VIN</dt>
              <dd className="break-all">{display(profile?.pin ?? identity.vin)}</dd>
            </dl>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/equipment"
              className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-1.5 font-semibold"
            >
              All equipment
            </Link>
            <Link
              href={`/vehicles/${identity.id}`}
              className="rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-1.5 font-semibold"
            >
              Full asset file
            </Link>
          </div>
        </div>
      </WorkspaceHeader>

      {/* 2. Current meters */}
      <WorkspaceSection headingId="asset-meters" eyebrow="Meters" title="Current meters">
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              ["Engine hours", identity.engineHours],
              [
                "Odometer",
                identity.mileage
                  ? `${identity.mileage} ${identity.odometerUnit ?? ""}`.trim()
                  : null,
              ],
              ["Cycles", profile?.currentCycles ?? null],
              ["Updated", profile?.metersUpdatedAt ? formatDate(profile.metersUpdatedAt) : null],
            ] as Array<[string, string | number | null]>
          ).map(([label, value]) => (
            <div key={label} className={`${ITEM} p-2`}>
              <dt className="text-xs text-[color:var(--theme-text-muted)]">{label}</dt>
              <dd className="mt-1 font-semibold">{display(value)}</dd>
            </div>
          ))}
        </dl>
      </WorkspaceSection>

      {/* 3. Open defects */}
      <WorkspaceSection
        headingId="asset-defects"
        eyebrow="Recorded evidence"
        title="Open defects"
        summary={defects.length ? `${defects.length} recorded` : undefined}
      >
        {defects.length ? (
          <ul className="mt-3 grid gap-2">
            {defects.map((item, index) => (
              <li key={`${item.reference.sourceId}-${index}`} className={`${ITEM} p-3 text-sm`}>
                <div className="flex justify-between gap-2">
                  <SourceLink reference={item.reference} permissions={permissions}>
                    {item.title || "Finding"}
                  </SourceLink>
                  <span
                    className={
                      item.severity === "urgent" ? "text-xs text-red-400" : "text-xs text-amber-400"
                    }
                  >
                    {item.severity === "urgent" ? "Failed" : "Recommended"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  {item.explanation} · {formatDate(item.occurredAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState>No open defects recorded for this asset.</EmptyState>
          </div>
        )}
      </WorkspaceSection>

      {/* 4. Active work */}
      <WorkspaceSection headingId="asset-active-work" eyebrow="In progress" title="Active work">
        {snapshot.activeWork.length || otherAttention.length ? (
          <ul className="mt-3 grid gap-2">
            {snapshot.activeWork.map((item) => (
              <li key={`${item.kind}-${item.reference.sourceId}`} className={`${ITEM} p-3 text-sm`}>
                <SourceLink reference={item.reference} permissions={permissions}>
                  {item.title}
                </SourceLink>
                <span className="ml-2 text-xs text-[color:var(--theme-text-muted)]">
                  {item.status}
                  {item.detail ? ` · ${item.detail}` : ""}
                </span>
              </li>
            ))}
            {otherAttention.map((item, index) => (
              <li key={`attention-${index}`} className={`${ITEM} p-3 text-sm`}>
                <SourceLink reference={item.reference} permissions={permissions}>
                  {item.title}
                </SourceLink>
                <span className="ml-2 text-xs text-[color:var(--theme-text-muted)]">
                  {item.kind === "waiting_parts" ? "Waiting on parts" : "Deferred"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState>No active work orders, estimates or parts requests.</EmptyState>
          </div>
        )}
      </WorkspaceSection>

      {/* 5. PM status */}
      <WorkspaceSection headingId="asset-pm" eyebrow="Preventive maintenance" title="PM status">
        {pmItems.length ? (
          <ul className="mt-3 grid gap-2">
            {pmItems.map((item, index) => (
              <li key={`pm-${index}`} className={`${ITEM} p-3 text-sm`}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{item.title}</span>
                  <span
                    className={
                      item.severity === "urgent" ? "text-xs text-red-400" : "text-xs text-amber-400"
                    }
                  >
                    {item.severity === "urgent" ? "Overdue" : "Due"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  {item.explanation}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState>No maintenance is currently due from the latest service evaluation.</EmptyState>
          </div>
        )}
        <p className="mt-3 text-sm">
          <span className="text-[color:var(--theme-text-muted)]">Next scheduled service: </span>
          {nextAppointment ? (
            <SourceLink reference={nextAppointment.reference} permissions={permissions}>
              {formatDate(nextAppointment.startsAt)}
            </SourceLink>
          ) : (
            "None booked"
          )}
        </p>
        <ComingNext>
          Hour, calendar, mileage and cycle-based Equipment PM intervals arrive with the
          Equipment PM engine.
        </ComingNext>
      </WorkspaceSection>

      {/* 6–8. Upcoming Equipment capabilities */}
      <div className="grid gap-4 lg:grid-cols-3">
        <WorkspaceSection headingId="asset-components" eyebrow="Components" title="Component condition">
          <ComingNext>
            Engine, hydraulics, final drives, undercarriage and attachments — each with its
            own identity and rebuild/swap history — arrive with the component hierarchy.
          </ComingNext>
        </WorkspaceSection>
        <WorkspaceSection headingId="asset-measurements" eyebrow="Measurements" title="Measurement trends">
          <ComingNext>
            Recorded measurements (track shoe height, pressures, blow-by, temperatures)
            with factual change and trend arrive with first-class measurements.
          </ComingNext>
        </WorkspaceSection>
        <WorkspaceSection headingId="asset-fluids" eyebrow="Fluids" title="Fluid / sample history">
          <ComingNext>Oil and fluid sample history arrives in a later Equipment release.</ComingNext>
        </WorkspaceSection>
      </div>

      {/* 9. Service history */}
      <WorkspaceSection
        headingId="asset-history"
        eyebrow="History"
        title="Service history"
        summary={
          <Link href={`/vehicles/${identity.id}`} className="underline">
            Full history
          </Link>
        }
      >
        {snapshot.recentTimeline.length ? (
          <ul className="mt-3 grid gap-2">
            {snapshot.recentTimeline.slice(0, 10).map((event, index) => (
              <li key={`${event.reference.sourceId}-${index}`} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-[color:var(--theme-text-muted)]">
                  {formatDate(event.occurredAt)}
                </span>
                <span className="min-w-0">
                  <SourceLink reference={event.reference} permissions={permissions}>
                    {event.title}
                  </SourceLink>
                  {event.detail ? (
                    <span className="block text-xs text-[color:var(--theme-text-muted)]">
                      {event.detail}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState>No service history recorded yet.</EmptyState>
          </div>
        )}
      </WorkspaceSection>

      {/* 10. Attachments & documents */}
      <WorkspaceSection headingId="asset-attachments" eyebrow="Linked" title="Attachments & documents">
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
              Attachments
            </h3>
            {host ? (
              <p className="mt-2 text-sm">
                Mounted on{" "}
                <Link href={host.href} className="font-semibold underline">
                  {host.label}
                </Link>
              </p>
            ) : null}
            {attachments.length ? (
              <ul className="mt-2 grid gap-1 text-sm">
                {attachments.map((attachment) => (
                  <li key={attachment.assetId}>
                    <Link href={attachment.href} className="font-semibold hover:underline">
                      {attachment.label}
                    </Link>
                    <span className="ml-2 text-xs text-[color:var(--theme-text-muted)]">
                      {attachment.equipmentClassLabel}
                    </span>
                  </li>
                ))}
              </ul>
            ) : !host ? (
              <p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">
                No attachments mounted on this asset.
              </p>
            ) : null}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
              Documents
            </h3>
            <p className="mt-2 text-sm">
              {snapshot.documentSummary.vehicleMediaCount} asset files ·{" "}
              {snapshot.documentSummary.workOrderMediaCount} work-order media ·{" "}
              {snapshot.documentSummary.inspectionReportCount} inspection reports
            </p>
            <Link href={`/vehicles/${identity.id}`} className="mt-1 inline-block text-sm underline">
              Open documents in the asset file
            </Link>
          </div>
        </div>
      </WorkspaceSection>

      {/* Editable Equipment profile */}
      <EquipmentAssetProfilePanel assetId={identity.id} showAssetHealthLink={false} />
    </WorkspaceShell>
  );
}
