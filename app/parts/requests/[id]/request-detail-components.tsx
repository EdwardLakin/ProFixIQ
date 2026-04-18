"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type Option = { value: string; label: string };

const CARD =
  "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
const SUBCARD =
  "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]";
const INPUT =
  "w-72 rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30";
const LINK_BTN =
  "rounded-md border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1 text-neutral-200 hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,black)]";

export function RequestStatusSummary({
  waiting,
  ordered,
  partiallyReceived,
  complete,
}: {
  waiting: number;
  ordered: number;
  partiallyReceived: number;
  complete: number;
}): JSX.Element {
  const pill =
    "rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-xs text-neutral-300";

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className={pill}>Waiting: <span className="text-white">{waiting}</span></div>
      <div className={pill}>Ordered: <span className="text-white">{ordered}</span></div>
      <div className={pill}>Partial: <span className="text-white">{partiallyReceived}</span></div>
      <div className={pill}>Complete: <span className="text-white">{complete}</span></div>
    </div>
  );
}

export function RequestHeaderSection({
  title,
  subtitle,
  selectedPo,
  poOptions,
  onSelectedPoChange,
  statusSummary,
}: {
  title: ReactNode;
  subtitle: string;
  selectedPo: string;
  poOptions: Option[];
  onSelectedPoChange: (next: string) => void;
  statusSummary: ReactNode;
}): JSX.Element {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="border-b border-[color:var(--desktop-border)] bg-[linear-gradient(180deg,rgba(148,163,184,0.08),rgba(15,23,42,0))] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold tracking-wide text-white">{title}</div>
            <div className="mt-1 text-sm text-neutral-400">{subtitle}</div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">PO</div>
            <select
              className={INPUT}
              value={selectedPo}
              onChange={(e) => onSelectedPoChange(e.target.value)}
              title="Optional: choose PO to apply receiving against"
            >
              <option value="">— none —</option>
              {poOptions.map((po) => (
                <option key={po.value} value={po.value}>
                  {po.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3">{statusSummary}</div>
      </div>
    </div>
  );
}

export function RequestProcurementPanel(): JSX.Element {
  return (
    <div className={`${SUBCARD} p-3`}>
      <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Procurement</div>
      <p className="mt-2 text-xs text-neutral-400">
        Supplier selection, PO creation/reuse, and PO assignment happen per item row.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link href="/parts/po" className={LINK_BTN}>
          → Open PO list
        </Link>
        <Link href="/parts/po/receive" className={LINK_BTN}>
          → Receive from PO
        </Link>
      </div>
    </div>
  );
}

export function RequestReceivingPanel(): JSX.Element {
  return (
    <div className={`${SUBCARD} p-3`}>
      <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">Receiving</div>
      <p className="mt-2 text-xs text-neutral-400">
        Use item-level Receive actions to open the Receive Drawer for partial or full intake.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <Link href="/parts/receiving" className={LINK_BTN}>
          → View Request Inbox
        </Link>
        <Link href="/parts/receive" className={LINK_BTN}>
          → Scan to Receive
        </Link>
      </div>
    </div>
  );
}

export function RequestItemsTable({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)]">
      {children}
    </div>
  );
}
