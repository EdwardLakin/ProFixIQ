import Link from "next/link";

import type { EquipmentFleetSummary } from "@/features/equipment/lib/equipmentDashboard";
import { WORKSPACE_PANEL as PANEL } from "@/features/workspace/components";

type BoardCard =
  | {
      key: string;
      title: string;
      href: string;
      detail: string;
      /** Counted from the same asset records as the Assets list. */
      value: number;
      tone: "bad" | "warn" | "muted";
    }
  | {
      key: string;
      title: string;
      href: string;
      detail: string;
      /** No Equipment data source is connected yet; no number is shown. */
      value: null;
    };

const TONE = {
  bad: "text-red-400",
  warn: "text-amber-400",
  muted: "",
} as const;

/**
 * The operations questions the Equipment dashboard exists to answer. Cards with
 * a source in today's asset records show their real count; the rest say they are
 * not connected rather than showing a placeholder number.
 */
export function equipmentBoardCards(summary: EquipmentFleetSummary): BoardCard[] {
  return [
    {
      key: "machines-down",
      title: "Machines down",
      href: "/equipment",
      detail: "Down or out of service",
      value: summary.status.down + summary.status.out_of_service,
      tone: "bad",
    },
    {
      key: "open-work",
      title: "Open work orders",
      href: "/equipment/work-orders",
      detail: `On ${summary.openWork.assets.toLocaleString()} machines`,
      value: summary.openWork.orders,
      tone: "muted",
    },
    {
      key: "pm-due",
      title: "PM due",
      href: "/equipment/pm",
      detail: "Overdue or due now",
      value: summary.pm.overdue + summary.pm.due,
      tone: summary.pm.overdue > 0 ? "bad" : "warn",
    },
    {
      key: "field-jobs",
      title: "Active field jobs",
      href: "/equipment/dispatch",
      detail: "Jobs in progress on service trucks",
      value: null,
    },
    {
      key: "dispatch",
      title: "Dispatch",
      href: "/equipment/dispatch",
      detail: "Technicians and service trucks available",
      value: null,
    },
    {
      key: "approvals",
      title: "Approvals waiting",
      href: "/equipment/work-orders",
      detail: "Estimates awaiting a customer decision",
      value: null,
    },
    {
      key: "parts-holds",
      title: "Parts holds",
      href: "/equipment/parts",
      detail: "Repairs waiting on parts",
      value: null,
    },
  ];
}

export default function EquipmentOperationsBoard({
  summary,
}: {
  summary: EquipmentFleetSummary;
}) {
  return (
    <section aria-label="Operations" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Operations</h2>
      {summary.partial ? (
        <p className={`${PANEL} p-3 text-sm text-amber-400`} role="status">
          Counts cover the {summary.total.toLocaleString()} most recently updated assets and are
          incomplete.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {equipmentBoardCards(summary).map((card) => (
          <li key={card.key}>
            <Link
              href={card.href}
              className={`${PANEL} flex h-full min-h-28 flex-col gap-1 p-4 transition hover:bg-[color:var(--theme-surface-overlay)]`}
            >
              <span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">
                {card.title}
              </span>
              {card.value === null ? (
                <span className="text-sm font-semibold text-[color:var(--theme-text-muted)]">
                  Not connected yet
                </span>
              ) : (
                <span
                  className={`text-3xl font-bold tabular-nums ${
                    card.value > 0 ? TONE[card.tone] : ""
                  }`}
                >
                  {card.value.toLocaleString()}
                </span>
              )}
              <span className="text-xs text-[color:var(--theme-text-muted)]">{card.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
