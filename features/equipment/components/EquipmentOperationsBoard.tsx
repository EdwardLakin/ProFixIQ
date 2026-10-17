import type { EquipmentOperationCounts } from "@/features/equipment/lib/equipmentOperationCounts";
import Link from "next/link";

import type { EquipmentFleetSummary } from "@/features/equipment/lib/equipmentDashboard";
import {
  equipmentShellItem,
  type EquipmentShellItemKey,
} from "@/features/equipment/lib/equipmentShellNav";
import type { CanonicalRole } from "@/features/shared/lib/rbac";
import { WORKSPACE_PANEL as PANEL } from "@/features/workspace/components";

type BoardCard =
  | {
      key: string;
      title: string;
      href: string;
      /** Shell section the card links to; the viewer's role must be able to open it. */
      destination: EquipmentShellItemKey;
      detail: string;
      /** Counted from the same asset records as the Assets list. */
      value: number;
      tone: "bad" | "warn" | "muted";
    }
  | {
      key: string;
      title: string;
      href: string;
      /** Shell section the card links to; the viewer's role must be able to open it. */
      destination: EquipmentShellItemKey;
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
export function equipmentBoardCards(
  summary: EquipmentFleetSummary,
  operations?: EquipmentOperationCounts,
): BoardCard[] {
  const cards: BoardCard[] = [
    {
      key: "machines-down",
      title: "Machines down",
      href: "/equipment",
      destination: "assets",
      detail: "Down or out of service",
      value: summary.status.down + summary.status.out_of_service,
      tone: "bad",
    },
    {
      key: "open-work",
      title: "Open work orders",
      href: "/equipment/work-orders",
      destination: "work",
      detail: `On ${summary.openWork.assets.toLocaleString()} machines`,
      value: summary.openWork.orders,
      tone: "muted",
    },
    {
      key: "pm-due",
      title: "PM due",
      href: "/equipment/pm",
      destination: "pm",
      detail: "Overdue or due now",
      value: summary.pm.overdue + summary.pm.due,
      tone: summary.pm.overdue > 0 ? "bad" : "warn",
    },
    {
      key: "field-jobs",
      title: "Active field jobs",
      href: "/equipment/dispatch",
      destination: "dispatch",
      detail: "Jobs in progress on service trucks",
      value: null,
    },
    {
      key: "dispatch",
      title: "Dispatch",
      href: "/equipment/dispatch",
      destination: "dispatch",
      detail: "Technicians and service trucks available",
      value: null,
    },
    {
      key: "approvals",
      title: "Approvals waiting",
      href: "/equipment/work-orders",
      destination: "work",
      detail: "Estimates awaiting a customer decision",
      value: null,
    },
    {
      key: "parts-holds",
      title: "Parts holds",
      href: "/equipment/parts",
      destination: "parts",
      detail: "Repairs waiting on parts",
      value: null,
    },
  ];
  if (!operations) return cards;
  return cards.map((card): BoardCard => {
    const metric =
      card.key === "approvals"
        ? operations.approvals
        : card.key === "parts-holds"
          ? operations.parts
          : card.key === "field-jobs"
            ? operations.field
            : null;
    if (!metric) return card;
    const detail =
      card.key === "field-jobs"
        ? "Scheduled through paused mobile visits: last 12 hours through next 7 days, plus unscheduled"
        : card.key === "approvals"
          ? "Sent estimates awaiting a customer decision"
          : "Work orders waiting on parts";
    const common = {
      ...card,
      title: card.key === "field-jobs" ? "Active field visits" : card.title,
      href: metric.href,
      destination:
        card.key === "field-jobs" ? ("dispatch" as const) : ("work" as const),
      detail:
        metric.value === null
          ? `${detail}. Count unavailable.`
          : metric.partial
            ? `${detail}. Incomplete scan; additional records may be omitted.`
            : detail,
    };
    return metric.value === null
      ? { ...common, value: null }
      : { ...common, value: metric.value, tone: "muted" };
  });
}

export default function EquipmentOperationsBoard({
  summary,
  role,
  operations,
}: {
  summary: EquipmentFleetSummary;
  /** Cards whose destination this role cannot open render as plain tiles, not links. */
  role: CanonicalRole;
  operations?: EquipmentOperationCounts;
}) {
  return (
    <section aria-label="Operations" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Operations</h2>
      {summary.partial ? (
        <p className={`${PANEL} p-3 text-sm text-amber-400`} role="status">
          Asset summary counts cover {summary.total.toLocaleString()} scanned
          assets and are incomplete.
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {equipmentBoardCards(summary, operations).map((card) => {
          const body = (
            <>
              <span className="text-xs font-semibold text-[color:var(--theme-text-muted)]">
                {card.title}
              </span>
              {card.value === null ? (
                <span className="text-sm font-semibold text-[color:var(--theme-text-muted)]">
                  {operations &&
                  ["field-jobs", "approvals", "parts-holds"].includes(card.key)
                    ? "Unavailable"
                    : "Not connected yet"}
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
              <span className="text-xs text-[color:var(--theme-text-muted)]">
                {card.detail}
              </span>
            </>
          );
          const tile = `${PANEL} flex h-full min-h-28 flex-col gap-1 p-4`;
          return (
            <li key={card.key}>
              {equipmentShellItem(card.destination).visibleTo(role) ? (
                <Link
                  href={card.href}
                  className={`${tile} transition hover:bg-[color:var(--theme-surface-overlay)]`}
                >
                  {body}
                </Link>
              ) : (
                <div className={tile}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
