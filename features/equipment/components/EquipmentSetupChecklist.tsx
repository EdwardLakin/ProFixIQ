import Link from "next/link";

import {
  WORKSPACE_EYEBROW as EYEBROW,
  WORKSPACE_PANEL as PANEL,
} from "@/features/workspace/components";

export type EquipmentSetupState = {
  meterRecorded: boolean;
  componentsConfigured: boolean | null;
  pmConfigured: boolean;
  inspectionRecorded: boolean;
};

type SetupItem = {
  key: keyof EquipmentSetupState;
  label: string;
  description: string;
  href: string;
  action: string;
};

const ITEMS: SetupItem[] = [
  {
    key: "meterRecorded",
    label: "Record current meter",
    description: "Set the machine's current hours, distance, or cycles so maintenance can be evaluated from a real baseline.",
    href: "#asset-meters",
    action: "Open meters",
  },
  {
    key: "componentsConfigured",
    label: "Add standard components",
    description: "Build the installed component hierarchy for engines, hydraulics, undercarriage, attachments, and other tracked assemblies.",
    href: "#asset-components",
    action: "Open components",
  },
  {
    key: "pmConfigured",
    label: "Create a PM plan",
    description: "Add at least one active Equipment PM plan so due service can be evaluated from meters and calendar intervals.",
    href: "#asset-pm",
    action: "Open PM",
  },
  {
    key: "inspectionRecorded",
    label: "Complete the first inspection",
    description: "Use the existing ProFixIQ inspection workflow to establish the machine's first recorded condition baseline.",
    href: "/inspections",
    action: "Open inspections",
  },
];

export default function EquipmentSetupChecklist({
  state,
}: {
  state: EquipmentSetupState;
}) {
  const completeCount = ITEMS.filter((item) => state[item.key] === true).length;
  if (completeCount === ITEMS.length) return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <section className={`${PANEL} p-4`} aria-labelledby="equipment-setup-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={EYEBROW}>Equipment setup</p>
            <h2 id="equipment-setup-title" className="mt-1 text-lg font-bold">
              Finish configuring this asset
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[color:var(--theme-text-muted)]">
              The canonical asset already exists. Complete these Equipment-specific steps using the existing ProFixIQ workflows below.
            </p>
          </div>
          <p className="text-sm font-semibold">
            {completeCount} of {ITEMS.length} complete
          </p>
        </div>

        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {ITEMS.map((item) => {
            const value = state[item.key];
            const complete = value === true;
            const unknown = value === null;
            return (
              <li
                key={item.key}
                className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.label}</p>
                    <p className="mt-1 text-xs text-[color:var(--theme-text-muted)]">{item.description}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-[color:var(--theme-text-muted)]">
                    {complete ? "Complete" : unknown ? "Check unavailable" : "To do"}
                  </span>
                </div>
                {!complete ? (
                  <Link href={item.href} className="mt-3 inline-flex text-sm font-semibold hover:underline">
                    {item.action}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
