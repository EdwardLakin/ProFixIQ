"use client";

import Link from "next/link";
import WorkOrderBoard from "./WorkOrderBoard";
import type { WorkOrderBoardVariant } from "../../lib/workboard/types";

export default function WorkOrderBoardWidget(props: {
  variant?: WorkOrderBoardVariant;
  fleetId?: string | null;
  href?: string;
}) {
  const variant = props.variant ?? "shop";

  return (
    <div className="space-y-3">
      <WorkOrderBoard
        variant={variant}
        compact
        limit={5}
        fleetId={props.fleetId}
        title={
          variant === "fleet"
            ? "Fleet live board"
            : variant === "portal"
              ? "Live status"
              : "Work order board"
        }
        subtitle={
          variant === "fleet"
            ? "5 most recent live units. Expand for the full board."
            : variant === "portal"
              ? "Live status updates. Expand for full history."
              : "5 most recent active work orders. Expand for the full board."
        }
      />

      <div className="flex justify-end">
        <Link
          href={
            props.href ??
            (variant === "fleet"
              ? "/portal/fleet/board"
              : variant === "portal"
                ? "/portal/status"
                : "/work-orders/board")
          }
          className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-black/35"
        >
          View full board
        </Link>
      </div>
    </div>
  );
}
