import Link from "next/link";

import {
  EQUIPMENT_FIELD_ENTRY_LINKS,
  type EquipmentFieldEntryState,
} from "@/features/equipment/lib/equipmentFieldEntry";
import {
  WorkspaceHeader,
  WorkspaceShell,
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

const STATE_COPY: Record<
  Exclude<EquipmentFieldEntryState, "ready">,
  { title: string; body: string }
> = {
  operator_required: {
    title: "Field assignment required",
    body: "You are not enabled as a field operator yet. Ask an owner or admin to assign you before you can open field jobs.",
  },
  setup_required: {
    title: "Field service setup is not finished",
    body: "Field service has not been configured for this business yet. An owner or admin needs to finish setup before field jobs are available.",
  },
  unavailable: {
    title: "Field service is not available",
    body: "Field service access could not be confirmed for your account.",
  },
};

/**
 * Equipment technician entry. Links are shown only when the canonical Field
 * access check passes, so every advertised action leads to a usable screen.
 */
export default function EquipmentFieldEntryView({
  state,
  canConfigure = false,
}: {
  state: EquipmentFieldEntryState;
  canConfigure?: boolean;
}) {
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={EYEBROW}>Equipment</p>
        <h1 className="mt-1 text-2xl font-bold">Field</h1>
        <p className="mt-1 text-sm text-[color:var(--theme-text-muted)]">
          Your jobs, service calls and truck stock for work on the jobsite.
        </p>
      </WorkspaceHeader>

      {state === "ready" ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EQUIPMENT_FIELD_ENTRY_LINKS.map((link) => (
            <li key={link.key}>
              <Link
                href={link.href}
                className={`${PANEL} flex min-h-24 flex-col justify-center gap-1 p-4 transition hover:bg-[color:var(--theme-surface-overlay)]`}
              >
                <span className="text-base font-semibold">{link.label}</span>
                <span className="text-sm text-[color:var(--theme-text-muted)]">
                  {link.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <section className={`${PANEL} flex flex-col gap-3 p-4`} role="status">
          <h2 className="text-sm font-semibold">{STATE_COPY[state].title}</h2>
          <p className="text-sm text-[color:var(--theme-text-muted)]">
            {STATE_COPY[state].body}
          </p>
          {state === "setup_required" && canConfigure ? (
            <Link
              href="/mobile/service/setup"
              className="inline-flex min-h-11 w-fit items-center rounded-lg border border-[color:var(--theme-border-soft)] px-4 py-2 text-sm font-semibold transition hover:bg-[color:var(--theme-surface-overlay)]"
            >
              Set up field service
            </Link>
          ) : null}
        </section>
      )}
    </WorkspaceShell>
  );
}
