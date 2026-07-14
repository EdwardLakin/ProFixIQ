"use client";

import { useEffect, useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import type { FleetUiContext } from "@/features/fleet/lib/fleetUiCapabilities";
import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";

type DB = Database;
type FleetServiceRequest =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];

export default function FleetServiceRequestsPage({
  uiContext,
}: {
  uiContext: FleetUiContext;
}) {
  const [requests, setRequests] = useState<FleetServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] =
    useState<FleetServiceRequest["status"] | "all">("open");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: reqErr } = await supabase
          .from("fleet_service_requests")
          .select("*")
          .order("created_at", { ascending: false });

        if (reqErr) throw reqErr;

        const baseData = (data as FleetServiceRequest[]) ?? [];
        const filtered =
          statusFilter === "all"
            ? baseData
            : baseData.filter((r) => r.status === statusFilter);

        if (!cancelled) {
          setRequests(filtered);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to load data.";
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <main className="min-h-[calc(100vh-3rem)] px-4 py-6 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto w-full max-w-5xl">
        <h1
          className="mb-2 text-3xl text-sky-300"
          style={{ fontFamily: "var(--font-blackops)" }}
        >
          Fleet Service Requests
        </h1>
        <p className="mb-4 text-xs text-[color:var(--theme-text-muted)]">
          Actor surface: {uiContext.actorLabel}
        </p>

        <div className="mb-4 flex flex-wrap gap-3">
          {(["all", "open", "scheduled", "completed"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1 text-sm transition ${
                statusFilter === st
                  ? "bg-sky-300 text-[color:var(--theme-text-on-accent)]"
                  : "border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)] hover:bg-[color:var(--theme-surface-panel)]"
              }`}
            >
              {st === "all" ? "All" : st[0].toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-400">Error: {error}</p>}

        {loading && (
          <p className="text-sm text-[color:var(--theme-text-secondary)]">Loading requests…</p>
        )}

        {!loading && requests.length === 0 && (
          <p className="mt-4 text-sm text-[color:var(--theme-text-secondary)]">
            No service requests {statusFilter !== "all" ? `(${statusFilter})` : ""}.
          </p>
        )}

        <div className="mt-4 space-y-3">
          {requests.map((req) => (
            <div
              key={req.id}
              className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 backdrop-blur-xl"
            >
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-medium text-[color:var(--theme-text-primary)]">{req.title}</p>
                  <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                    {req.severity.toUpperCase()} •{" "}
                    {new Date(req.created_at).toLocaleString()}
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">
                    {req.summary}
                  </p>
                </div>
                <span
                  className="self-start rounded-full px-2 py-1 text-[10px] uppercase tracking-wide"
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(56,189,248,0.18)",
                  }}
                >
                  {req.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
