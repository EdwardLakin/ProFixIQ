"use client";

import { useMemo, useState } from "react";
import { cn } from "@/features/shared/lib/utils";
import type { WorkspaceCapabilityEffect } from "@/features/workspace/authorization/capabilities";
import CapabilityEffectControl, {
  type CapabilityEffectOption,
} from "./CapabilityEffectControl";
import {
  capabilityGroups,
  decisionSourceLabel,
  employeeCapabilityRows,
  roleLabel,
  type EmployeeCapabilityRow,
} from "./permissionModel";
import { usePermissionAdministration } from "./usePermissionAdministration";

function employeeOptions(
  row: EmployeeCapabilityRow,
  role: string,
): CapabilityEffectOption[] {
  const protectedReason = "ProFixIQ manages this permission.";
  const ceilingReason = "You cannot grant authority you do not hold.";
  return [
    {
      value: "inherit",
      label: `Use ${roleLabel(role)} setting`,
      disabled: row.isProtected || (row.roleGranted && !row.actorCanGrant),
      disabledReason: row.isProtected ? protectedReason : ceilingReason,
    },
    {
      value: "allow",
      label: "Allow",
      disabled: row.isProtected || !row.actorCanGrant,
      disabledReason: row.isProtected ? protectedReason : ceilingReason,
    },
    {
      value: "deny",
      label: "Deny",
      disabled: row.isProtected,
      disabledReason: protectedReason,
    },
  ];
}

export default function EmployeeAccessPanel({
  profileId,
}: {
  profileId: string;
}) {
  const admin = usePermissionAdministration(profileId);
  const [expanded, setExpanded] = useState(false);

  const employee = admin.snapshot?.employee ?? null;
  const rows = useMemo(
    () => (admin.snapshot ? employeeCapabilityRows(admin.snapshot) : []),
    [admin.snapshot],
  );
  const groups = useMemo(
    () => capabilityGroups(rows.map((row) => row.descriptor)),
    [rows],
  );
  const rowByKey = useMemo(
    () => new Map(rows.map((row) => [row.descriptor.capabilityKey, row])),
    [rows],
  );
  const overrides = employee?.overrides.length ?? 0;

  if (admin.loading && !admin.snapshot) {
    return (
      <p className="px-4 pb-4 text-xs text-[color:var(--theme-text-secondary)]">
        Loading access…
      </p>
    );
  }

  if (admin.forbidden) {
    return (
      <p className="px-4 pb-4 text-xs text-[color:var(--theme-text-secondary)]">
        You do not have permission to change this employee&apos;s access.
      </p>
    );
  }

  if (!admin.snapshot || !employee) {
    return (
      <p className="px-4 pb-4 text-xs text-[color:var(--theme-text-secondary)]">
        {admin.error ?? "Access could not be loaded for this employee."}
      </p>
    );
  }

  const readOnly = !employee.manageable;
  const role = employee.canonicalRole;

  const clearOverrides = async () => {
    for (const row of rows) {
      if (row.value === "inherit" || row.isProtected) continue;
      await admin.setStaffOverride(row.descriptor.capabilityKey, "inherit");
    }
  };

  return (
    <div className="space-y-3 px-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            Using the <strong>{roleLabel(role)}</strong> permissions configured
            for this shop.
          </p>
          <p className="mt-0.5 text-xs text-[color:var(--theme-text-muted)]">
            {overrides === 0
              ? "No individual overrides."
              : `${overrides} individual ${
                  overrides === 1 ? "override" : "overrides"
                }.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {overrides > 0 && !readOnly ? (
            <button
              type="button"
              onClick={() => void clearOverrides()}
              className="min-h-9 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
            >
              Clear individual overrides
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="min-h-9 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold text-[color:var(--theme-text-primary)]"
          >
            {expanded ? "Hide permissions" : "Review permissions"}
          </button>
        </div>
      </div>

      {readOnly ? (
        <p className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
          {employee.isSelf
            ? "You cannot change your own permissions."
            : "This employee is at or above your authority, so their permissions are read-only for you."}
        </p>
      ) : null}

      {admin.error ? (
        <p className="rounded-xl border border-[color:var(--theme-danger-border,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--theme-danger-text)_10%,transparent)] px-3 py-2 text-xs text-[color:var(--theme-danger-text)]">
          {admin.error}
        </p>
      ) : null}
      {admin.notice ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-[color:var(--theme-success-text)]">
          {admin.notice}
        </p>
      ) : null}

      {expanded ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.id} className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                {group.label}
              </h4>
              <ul className="space-y-2">
                {group.descriptors.map((descriptor) => {
                  const row = rowByKey.get(descriptor.capabilityKey);
                  if (!row) return null;
                  const individual = row.value !== "inherit";
                  return (
                    <li
                      key={descriptor.capabilityKey}
                      className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
                    >
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                            {descriptor.label}
                          </p>
                          <p className="mt-0.5 text-xs text-[color:var(--theme-text-secondary)]">
                            {descriptor.description}
                          </p>
                          <p className="mt-1.5 text-[11px]">
                            <span
                              className={cn(
                                "font-semibold",
                                row.effectiveGranted
                                  ? "text-[color:var(--theme-success-text)]"
                                  : "text-[color:var(--theme-text-secondary)]",
                              )}
                            >
                              {row.effectiveGranted ? "Allowed" : "Not allowed"}
                            </span>
                            <span className="text-[color:var(--theme-text-muted)]">
                              {" — "}
                              {decisionSourceLabel(row.source, role)}
                            </span>
                          </p>
                          {individual ? (
                            <p className="mt-0.5 text-[11px] text-[color:var(--theme-text-muted)]">
                              {roleLabel(role)} setting:{" "}
                              {row.roleGranted ? "Allowed" : "Not allowed"}
                            </p>
                          ) : null}
                        </div>
                        <CapabilityEffectControl
                          name={`${descriptor.label} for ${
                            employee.fullName ?? "this employee"
                          }`}
                          value={row.value}
                          options={employeeOptions(row, role)}
                          disabled={readOnly}
                          busy={
                            admin.pendingCapability === descriptor.capabilityKey
                          }
                          onChange={(next: WorkspaceCapabilityEffect) =>
                            void admin.setStaffOverride(
                              descriptor.capabilityKey,
                              next,
                            )
                          }
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
