"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import PickOrderTaskModal from "@/features/parts/components/PickOrderTaskModal";
import {
  partsRequestStageLabel,
  type PartsRequestStage,
} from "@/features/parts/lib/status-display";
import {
  WorkspaceShell,
  WorkspaceHeader,
  WORKSPACE_EYEBROW,
  WORKSPACE_PANEL,
} from "@/features/workspace/components";
import {
  equipmentPartsPage,
  type EquipmentPartsRow,
} from "../lib/equipmentParts";

const CONTROL =
  "min-h-11 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm disabled:opacity-50";
const STAGES: PartsRequestStage[] = [
  "needs_quote",
  "awaiting_approval",
  "order_receive",
  "ready_for_tech",
  "completed",
];

export default function EquipmentPartsView({
  rows = [],
  restricted = false,
  error = false,
}: {
  rows?: EquipmentPartsRow[];
  restricted?: boolean;
  error?: boolean;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [page, setPage] = useState(1);
  const [pick, setPick] = useState<EquipmentPartsRow | null>(null);
  const result = equipmentPartsPage(rows, query, stage, page);
  const refresh = () => startTransition(() => router.refresh());
  return (
    <WorkspaceShell>
      <WorkspaceHeader>
        <p className={WORKSPACE_EYEBROW}>Equipment</p>
        <h1 className="mt-1 text-2xl font-bold">Parts requests</h1>
        <p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">
          Requests attached to this shop’s Equipment work orders. Pick approved
          stock here; quoting, ordering, receiving and handoff continue in the
          shared Parts workspace.
        </p>
      </WorkspaceHeader>
      {restricted ? (
        <section className={`${WORKSPACE_PANEL} p-4`} role="status">
          Your role can navigate to Equipment Parts but does not have access to
          the Parts request queue. Queue access requires owner, admin, manager
          or parts permissions. No request or financial data is shown.
        </section>
      ) : (
        <>
          <nav
            aria-label="Shared Parts workspaces"
            className="flex flex-wrap gap-2"
          >
            <Link className={CONTROL} href="/parts/inventory">
              Inventory ↗
            </Link>
            <Link className={CONTROL} href="/parts/po">
              Purchase orders ↗
            </Link>
            <Link className={CONTROL} href="/parts/requests">
              Full Parts workflow ↗
            </Link>
          </nav>
          <p className="text-sm text-[color:var(--theme-text-muted)]">
            Shared inventory and purchasing cover the whole shop, including
            other products.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              Search requests
              <input
                className={CONTROL}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Work order or part description"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Workflow stage
              <select
                className={CONTROL}
                value={stage}
                onChange={(e) => {
                  setStage(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All stages</option>
                {STAGES.map((value) => (
                  <option key={value} value={value}>
                    {partsRequestStageLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <button className={CONTROL} disabled={refreshing} onClick={refresh}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {error ? (
            <p role="alert" className={`${WORKSPACE_PANEL} p-4`}>
              Equipment Parts could not be loaded. Refresh to retry.
            </p>
          ) : (
            <>
              <p role="status" className="text-sm">
                {result.total} matching requests · Page {result.page} of{" "}
                {result.pageCount}
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {result.rows.map((row) => (
                  <article
                    key={row.id}
                    className={`${WORKSPACE_PANEL} min-w-0 space-y-3 p-4`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-semibold">{row.workOrderLabel}</h2>
                      <span className="rounded-lg bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm">
                        {partsRequestStageLabel(row.stage)}
                      </span>
                    </div>
                    <p className="text-xs text-[color:var(--theme-text-muted)]">
                      Request {row.id.slice(0, 8)} · {row.items.length} items
                    </p>
                    <ul className="space-y-2 text-sm">
                      {row.items.map((item) => (
                        <li key={item.id} className="break-words">
                          {item.description || "Part"}
                          <span className="block text-xs text-[color:var(--theme-text-muted)]">
                            Requested: {item.requested ?? "—"} · Received:{" "}
                            {item.received ?? "—"} · Reserved:{" "}
                            {item.reserved ?? "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {!row.items.length ? (
                      <p className="text-sm">
                        No items. Open the request to review or dismiss it.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {row.stage === "order_receive" ? (
                        <button
                          className={CONTROL}
                          onClick={() => setPick(row)}
                        >
                          Pick / order approved parts
                        </button>
                      ) : null}
                      <Link
                        className={CONTROL}
                        href={`/parts/requests/${encodeURIComponent(row.workOrderId)}`}
                      >
                        Open request workflow ↗
                      </Link>
                      <Link
                        className={CONTROL}
                        href={`/equipment/${encodeURIComponent(row.assetId)}`}
                      >
                        Equipment asset
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
              {!result.total ? (
                <p className={`${WORKSPACE_PANEL} p-6 text-sm`}>
                  No Equipment parts requests match these filters.
                </p>
              ) : null}
              <nav aria-label="Request pagination" className="flex gap-2">
                <button
                  className={CONTROL}
                  disabled={result.page <= 1}
                  onClick={() => setPage(result.page - 1)}
                >
                  Previous
                </button>
                <button
                  className={CONTROL}
                  disabled={result.page >= result.pageCount}
                  onClick={() => setPage(result.page + 1)}
                >
                  Next
                </button>
              </nav>
            </>
          )}
          {pick && !error ? (
            <PickOrderTaskModal
              key={pick.workOrderId}
              open
              workOrderId={pick.workOrderId}
              workOrderLabel={pick.workOrderLabel}
              onClose={() => {
                setPick(null);
                refresh();
              }}
              onChanged={refresh}
            />
          ) : null}
        </>
      )}
    </WorkspaceShell>
  );
}
