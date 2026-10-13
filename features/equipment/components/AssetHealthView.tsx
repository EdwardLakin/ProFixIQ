import Link from "next/link";

import EquipmentAssetProfilePanel from "@/features/equipment/components/EquipmentAssetProfilePanel";
import EquipmentComponentPanel from "@/features/equipment/components/EquipmentComponentPanel";
import EquipmentFluidSamplePanel from "@/features/equipment/components/EquipmentFluidSamplePanel";
import EquipmentMeasurementPanel from "@/features/equipment/components/EquipmentMeasurementPanel";
import EquipmentMeterPanel from "@/features/equipment/components/EquipmentMeterPanel";
import EquipmentPmPanel from "@/features/equipment/components/EquipmentPmPanel";
import EquipmentUndercarriagePanel from "@/features/equipment/components/EquipmentUndercarriagePanel";
import { ASSET_OPERATING_STATUS_LABELS } from "@/features/equipment/lib/assetProfile";
import type { AssetHealth } from "@/features/equipment/server/loadAssetHealth";
import {
  canOpenActiveWork,
  canOpenReference,
  canOpenTimelineEvent,
} from "@/features/vehicles/components/VehicleWorkspace";
import type { VehicleWorkspaceReference } from "@/features/vehicles/lib/vehicleWorkspace";
import { EQUIPMENT_PM_STATE_LABELS } from "@/features/equipment/lib/equipmentDirectory";
import { combinePmStates } from "@/features/equipment/lib/pm";
import { labStatusLabel } from "@/features/equipment/lib/fluids";
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

/** Link only when the canonical vehicle-workspace permission rules allow it. */
function SourceLink({
  reference,
  canOpen,
  children,
}: {
  reference: VehicleWorkspaceReference;
  canOpen: boolean;
  children: React.ReactNode;
}) {
  const href = canOpen ? reference.href : null;
  return href ? (
    <Link href={href} className="font-semibold hover:underline">
      {children}
    </Link>
  ) : (
    <span className="font-semibold">{children}</span>
  );
}

/**
 * Asset Health: the neutral record of everything ProFixIQ knows about one
 * machine. Facts only — it surfaces recorded evidence; the technician makes
 * the diagnosis and repair decision.
 */
export default function AssetHealthView({
  health,
  canOpenComponentHistory = false,
}: {
  health: AssetHealth;
  /** Shop-wide (directory) roles may open a component's cross-machine history. */
  canOpenComponentHistory?: boolean;
}) {
  const { snapshot, equipment, evidence, pmPlans, fluidSamples, attachments, host } = health;
  const { identity, permissions } = snapshot;
  const profile = equipment.profile;
  const title =
    [
      identity.unitNumber ? `Unit ${identity.unitNumber}` : null,
      [identity.year, identity.make, identity.model].filter(Boolean).join(" ") || null,
    ]
      .filter(Boolean)
      .join(" · ") || "Asset";

  // Current recorded condition: findings on the latest completed canonical
  // inspection (shared with the directory), plus concerns still open on lines.
  const inspection = evidence.latestInspection;
  const concerns = snapshot.attentionItems.filter((item) => item.kind === "unresolved_concern");
  const inspectionReference: VehicleWorkspaceReference | null = inspection
    ? {
        sourceType: "inspection",
        sourceId: inspection.inspectionId,
        sourceLabel: "Latest inspection",
        href: `/inspections/${inspection.inspectionId}`,
      }
    : null;
  const pm = evidence.pm;
  // Same combination as the directory's PM column.
  const pmOverall = combinePmStates(pmPlans?.state ?? null, pm.state);
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
        <EquipmentMeterPanel assetId={identity.id} />
      </WorkspaceSection>

      {/* 3. Open defects */}
      <WorkspaceSection
        headingId="asset-defects"
        eyebrow="Recorded evidence"
        title="Open defects"
        summary={
          inspection
            ? `From latest inspection · ${formatDate(inspection.recordedAt)}`
            : undefined
        }
      >
        {inspection && inspection.findings.length ? (
          <ul className="mt-3 grid gap-2">
            {inspection.findings.map((finding) => (
              <li key={finding.key} className={`${ITEM} p-3 text-sm`}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">
                    {[finding.section, finding.label].filter(Boolean).join(" — ")}
                  </span>
                  <span
                    className={
                      finding.status === "fail" ? "text-xs text-red-400" : "text-xs text-amber-400"
                    }
                  >
                    {finding.status === "fail" ? "Failed" : "Recommended"}
                  </span>
                </div>
                {finding.measurement || finding.note ? (
                  <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                    {[finding.measurement, finding.note].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState>
              {inspection
                ? "The latest completed inspection recorded no failed or recommended items."
                : "No completed inspection on record for this asset."}
            </EmptyState>
          </div>
        )}
        {inspectionReference ? (
          <p className="mt-2 text-sm">
            <SourceLink
              reference={inspectionReference}
              canOpen={canOpenReference(inspectionReference, permissions)}
            >
              Open latest inspection
            </SourceLink>
          </p>
        ) : null}
        {concerns.length ? (
          <>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]">
              Open concerns
            </h3>
            <ul className="mt-2 grid gap-2">
              {concerns.map((item, index) => (
                <li key={`concern-${index}`} className={`${ITEM} p-3 text-sm`}>
                  <SourceLink
                    reference={item.reference}
                    canOpen={canOpenReference(item.reference, permissions)}
                  >
                    {item.title}
                  </SourceLink>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                    {item.explanation}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </WorkspaceSection>

      {/* 4. Active work */}
      <WorkspaceSection headingId="asset-active-work" eyebrow="In progress" title="Active work">
        {snapshot.activeWork.length || otherAttention.length ? (
          <ul className="mt-3 grid gap-2">
            {snapshot.activeWork.map((item) => (
              <li key={`${item.kind}-${item.reference.sourceId}`} className={`${ITEM} p-3 text-sm`}>
                <SourceLink
                  reference={item.reference}
                  canOpen={canOpenActiveWork(item, permissions)}
                >
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
                <SourceLink
                  reference={item.reference}
                  canOpen={canOpenReference(item.reference, permissions)}
                >
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
        <p className="mt-3 text-sm">
          <span className="text-[color:var(--theme-text-muted)]">Evaluation: </span>
          <span className="font-semibold">{EQUIPMENT_PM_STATE_LABELS[pmOverall]}</span>
        </p>
        {pmPlans ? (
          <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
            Equipment PM plans: {EQUIPMENT_PM_STATE_LABELS[pmPlans.state]} ·{" "}
            {pmPlans.activePlans} active{pmPlans.dueCount ? `, ${pmPlans.dueCount} due` : ""} · Service
            suggestions: {EQUIPMENT_PM_STATE_LABELS[pm.state]}
          </p>
        ) : null}
        {pm.items.length ? (
          <ul className="mt-3 grid gap-2">
            {pm.items.map((item) => (
              <li key={item.serviceCode} className={`${ITEM} p-3 text-sm`}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{item.label}</span>
                  <span
                    className={
                      item.overdue || item.isCritical
                        ? "text-xs text-red-400"
                        : "text-xs text-amber-400"
                    }
                  >
                    {item.overdue || item.isCritical ? "Overdue" : "Due"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{item.whyDue}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState>
              {pm.state === "ok"
                ? "The latest service evaluation found no maintenance due."
                : "Maintenance has not been evaluated from current service evidence."}
            </EmptyState>
          </div>
        )}
        <p className="mt-3 text-sm">
          <span className="text-[color:var(--theme-text-muted)]">Next scheduled service: </span>
          {nextAppointment ? (
            <SourceLink
              reference={nextAppointment.reference}
              canOpen={permissions.canOpenAppointments && canOpenReference(nextAppointment.reference, permissions)}
            >
              {formatDate(nextAppointment.startsAt)}
            </SourceLink>
          ) : (
            "None booked"
          )}
        </p>
        <EquipmentPmPanel assetId={identity.id} />
      </WorkspaceSection>

      {/* 6. Component hierarchy */}
      <EquipmentComponentPanel assetId={identity.id} canOpenHistory={canOpenComponentHistory} />

      {/* 7. Undercarriage wear (tracked machines with undercarriage components) */}
      <EquipmentUndercarriagePanel assetId={identity.id} />

      {/* 8. Measurements */}
      <EquipmentMeasurementPanel assetId={identity.id} />

      {/* 9. Fluid / sample history: latest lab sample per component and fluid, status as the lab reported it */}
      <WorkspaceSection headingId="asset-fluids" eyebrow="Fluids" title="Fluid / sample history">
        {fluidSamples.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {fluidSamples.map((sample) => (
              <li key={sample.key} className={`${ITEM} p-3 text-sm`}>
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{sample.label}</span>
                  <span
                    className={
                      sample.labStatus === "critical"
                        ? "text-xs text-red-400"
                        : sample.labStatus === "caution"
                          ? "text-xs text-amber-400"
                          : "text-xs text-[color:var(--theme-text-muted)]"
                    }
                  >
                    Lab: {labStatusLabel(sample.labStatus)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                  {[formatDate(sample.sampledAt), sample.labName, sample.labReportNumber ? `#${sample.labReportNumber}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyState>No lab fluid samples recorded for this asset.</EmptyState>
          </div>
        )}
      </WorkspaceSection>
      <EquipmentFluidSamplePanel assetId={identity.id} />

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
                  <SourceLink
                    reference={event.reference}
                    canOpen={canOpenTimelineEvent(event, permissions)}
                  >
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
