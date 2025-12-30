"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";

type DB = Database;

type FleetServiceRequest =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];

export default function FleetServiceRequestsPage() {
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

        const client = supabase as SupabaseClient<DB>;

        // 🔐 user
        const {
          data: { user },
          error: userError,
        } = await client.auth.getUser();
        if (userError || !user) throw new Error("Not signed in");

        // 🔍 find user's shop
        const { data: profile, error: profileErr } = await client
          .from("profiles")
          .select("id, shop_id")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (profileErr || !profile?.shop_id) {
          throw new Error("Must belong to a shop to view fleet requests.");
        }

        // 🚚 fleet requests by shop
        let query = client
          .from("fleet_service_requests")
          .select("*")
          .eq("shop_id", profile.shop_id)
          .order("created_at", { ascending: false });

        if (statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        const { data, error: reqErr } = await query;
        if (reqErr) throw reqErr;

        if (!cancelled) setRequests(data ?? []);
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
    <main className="mx-auto max-w-4xl p-6 text-white">
      <h1
        className="mb-6 text-3xl"
        style={{ fontFamily: "var(--font-blackops)" }}
      >
        Fleet Service Requests
      </h1>

      {/* Status filter */}
      <div className="mb-4 flex gap-3">
        {(["all", "open", "scheduled", "completed"] as const).map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`rounded-lg px-3 py-1 text-sm transition ${
              statusFilter === st
                ? "bg-[var(--accent-copper)] text-black"
                : "border border-white/10 bg-black/40 text-neutral-300 hover:bg-neutral-900"
            }`}
          >
            {st === "all" ? "All" : st[0].toUpperCase() + st.slice(1)}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && <p className="text-sm text-red-400">Error: {error}</p>}

      {/* Loading */}
      {loading && (
        <p className="text-sm text-neutral-400">Loading requests…</p>
      )}

      {/* Empty */}
      {!loading && requests.length === 0 && (
        <p className="mt-4 text-sm text-neutral-400">
          No service requests{" "}
          {statusFilter !== "all" ? `(${statusFilter})` : ""}.
        </p>
      )}

      {/* List */}
      <div className="mt-4 space-y-3">
        {requests.map((req) => (
          <div
            key={req.id}
            className="rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl"
          >
            <div className="flex justify-between">
              <div>
                <p className="font-medium text-white">{req.title}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {req.severity.toUpperCase()} •{" "}
                  {new Date(req.created_at).toLocaleString()}
                </p>
                <p className="mt-2 text-sm text-neutral-300">
                  {req.summary}
                </p>
              </div>
              <span
                className="rounded-full px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(193,102,59,0.18)",
                }}
              >
                {req.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}