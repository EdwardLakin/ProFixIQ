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

  const title =
    variant === "fleet"
      ? "Fleet live board"
      : variant === "portal"
        ? "Live repair status"
        : "Live work board";

  const subtitle =
    variant === "fleet"
      ? "Current unit and repair status across fleet work orders."
      : variant === "portal"
        ? "Track progress, approvals, and next steps in real time."
        : "Current shop activity across active work orders.";

  const href =
    props.href ??
    (variant === "fleet"
      ? "/portal/fleet/board"
      : variant === "portal"
        ? "/portal/status"
        : "/work-orders/board");

  const ctaLabel =
    variant === "portal" ? "Open live status" : "Open full board";

  return (
    <div className="space-y-3">
      <WorkOrderBoard
        variant={variant}
        compact
        limit={5}
        fleetId={props.fleetId}
        title={title}
        subtitle={subtitle}
      />

      <div className="flex justify-end">
        <Link
          href={href}
          className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-black/35"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}