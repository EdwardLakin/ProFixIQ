"use client";

import { useMemo, useState } from "react";
import { cn } from "@/features/shared/lib/utils";
import type {
  WorkspaceCapabilityEffect,
  WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";
import CapabilityEffectControl, {
  type CapabilityEffectOption,
} from "./CapabilityEffectControl";
import {
  capabilityGroups,
  customizedRoleCount,
  roleCapabilityRows,
  roleLabel,
  type RoleCapabilityRow,
} from "./permissionModel";
import { usePermissionAdministration } from "./usePermissionAdministration";

function EffectiveBadge({
  granted,
  customized,
}: {
  granted: boolean;
  customized: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        granted
          ? "bg-[color:color-mix(in_srgb,var(--theme-success-text)_16%,transparent)] text-[color:var(--theme-success-text)]"
          : "bg-[color:color-mix(in_srgb,var(--theme-text-muted)_16%,transparent)] text-[color:var(--theme-text-secondary)]",
      )}
    >
      {granted ? "Allowed" : "Not allowed"}
      <span className="font-normal opacity-80">
        {customized ? "· shop setting" : "· ProFixIQ default"}
      </span>
    </span>
  );
}

function roleOptions(row: RoleCapabilityRow): CapabilityEffectOption[] {
  const protectedReason = "ProFixIQ manages this permission.";
  const ceilingReason = "You cannot grant authority you do not hold.";
  const restoreWouldGrant = row.presetEffect === "allow";
  return [
    {
      value: "inherit",
      label: "ProFixIQ default",
      disabled:
        row.isProtected || (restoreWouldGrant && !row.actorCanGrant),
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

export default function RolePermissionsPanel() {
  const admin = usePermissionAdministration();
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  const roles = admin.snapshot?.manageableRoles ?? [];
  const activeRole = selectedRole ?? roles[0] ?? null;
  const rows = useMemo(
    () =>
      admin.snapshot && activeRole
        ? roleCapabilityRows(admin.snapshot, activeRole)
        : [],
    [admin.snapshot, activeRole],
  );
  const groups = useMemo(
    () => capabilityGroups(rows.map((row) => row.descriptor)),
    [rows],
  );
  const rowByKey = useMemo(
    () => new Map(rows.map((row) => [row.descriptor.capabilityKey, row])),
    [rows],
  );
  const customized =
    admin.snapshot && activeRole
      ? customizedRoleCount(admin.snapshot, activeRole)
      : 0;

  if (admin.loading && !admin.snapshot) {
    return (
      <p className="text-sm text-[color:var(--theme-text-secondary)]">
        Loading roles and permissions…
      </p>
    );
  }

  if (admin.forbidden) {
    return (
      <p className="text-sm text-[color:var(--theme-text-secondary)]">
        You do not have permission to change roles and permissions for this
        shop.
      </p>
    );
  }

  if (!admin.snapshot || !activeRole) {
    return (
      <p className="text-sm text-[color:var(--theme-text-secondary)]">
        {admin.error ??
          "There are no roles you are allowed to configure for this shop."}
      </p>
    );
  }

  const resetRole = async () => {
    for (const row of rows) {
      if (row.value === "inherit" || row.isProtected) continue;
      // Restoring an inherited ALLOW is still subject to the grant ceiling, so
      // rows the server refuses simply stay as they are and surface an error.
      await admin.setRolePolicy(
        activeRole,
        row.descriptor.capabilityKey,
        "inherit",
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {roles.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => {
              admin.clearMessages();
              setSelectedRole(role);
            }}
            aria-current={role === activeRole ? "true" : undefined}
            className={cn(
              "min-h-9 shrink-0 rounded-xl border px-3 text-xs font-semibold transition",
              role === activeRole
                ? "border-[color:color-mix(in_srgb,var(--accent-copper)_45%,var(--theme-border-soft))] bg-[color:color-mix(in_srgb,var(--accent-copper)_14%,var(--theme-surface-subtle))] text-[color:var(--theme-text-primary)]"
                : "border-[color:var(--theme-border-soft)] text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]",
            )}
          >
            {roleLabel(role)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[color:var(--theme-text-secondary)]">
          {customized === 0
            ? `${roleLabel(activeRole)} uses the ProFixIQ defaults.`
            : `${roleLabel(activeRole)} has ${customized} shop ${
                customized === 1 ? "change" : "changes"
              } from the ProFixIQ defaults.`}
        </p>
        {customized > 0 ? (
          <button
            type="button"
            onClick={() => void resetRole()}
            className="min-h-9 rounded-xl border border-[color:var(--theme-border-soft)] px-3 text-xs font-semibold text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
          >
            Reset to ProFixIQ defaults
          </button>
        ) : null}
      </div>

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

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.id} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
              {group.label}
            </h3>
            <ul className="space-y-2">
              {group.descriptors.map((descriptor) => {
                const row = rowByKey.get(descriptor.capabilityKey);
                if (!row) return null;
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
                        <div className="mt-1.5">
                          <EffectiveBadge
                            granted={row.effectiveGranted}
                            customized={row.customized}
                          />
                        </div>
                      </div>
                      <CapabilityEffectControl
                        name={`${roleLabel(activeRole)} — ${descriptor.label}`}
                        value={row.value}
                        options={roleOptions(row)}
                        busy={
                          admin.pendingCapability === descriptor.capabilityKey
                        }
                        onChange={(next: WorkspaceCapabilityEffect) =>
                          void admin.setRolePolicy(
                            activeRole,
                            descriptor.capabilityKey as WorkspaceCapabilityKey,
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
    </div>
  );
}
