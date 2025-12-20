// app/portal/parts/requests/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import PortalShell from "@/features/portal/components/PortalShell";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

// Extend locally in case your generated types haven't caught up yet.
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"] & {
  customer_id?: string | null;
  portal_user_id?: string | null;
};

type ItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];

const glass =
  "rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md shadow-card";
const muted = "text-neutral-400";

export default function PortalPartsRequestsPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<
    Array<RequestRow & { items: ItemRow[] }>
  >([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;

      // If portal auth isn't wired yet, just show empty state.
      if (!userId) {
        setRequests([]);
        setLoading(false);
        return;
      }

      // Fetch requests that look like "belong to this portal user".
      // We try a couple likely columns without relying on them existing in types.
      const { data: reqs, error } = await supabase
        .from("part_requests")
        .select("*")
        .or(`customer_id.eq.${userId},portal_user_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("portal parts requests load failed:", error.message);
        setRequests([]);
        setLoading(false);
        return;
      }

      const list = (reqs ?? []) as RequestRow[];
      const ids = list.map((r) => r.id);

      const itemsMap: Record<string, ItemRow[]> = {};
      if (ids.length) {
        const { data: items } = await supabase
          .from("part_request_items")
          .select("*")
          .in("request_id", ids);

        for (const it of items ?? []) {
          (itemsMap[it.request_id] ||= []).push(it);
        }
      }

      setRequests(list.map((r) => ({ ...r, items: itemsMap[r.id] ?? [] })));
      setLoading(false);
    })();
  }, [supabase]);

  return (
    <PortalShell
      title="Customer Portal"
      subtitle="Review parts requested by your shop and track approvals"
    >
      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Parts Requests
          </div>
          <h1 className="font-header text-3xl text-orange-400">
            Requests & Approvals
          </h1>
          <p className={`mt-1 text-sm ${muted}`}>
            If your shop needs your approval before ordering parts, you’ll see
            the requests here.
          </p>
        </div>

        {loading ? (
          <div className={`${glass} ${muted} text-sm`}>Loading…</div>
        ) : requests.length === 0 ? (
          <div className={`${glass} ${muted} text-sm`}>
            No parts requests found yet.
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/portal/parts"
                className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-black/70"
              >
                Back to Parts
              </Link>
              <Link
                href="/portal/history"
                className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-black/70"
              >
                View history
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {requests.map((r) => (
              <div key={r.id} className={glass}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-neutral-100">
                      Request #{r.id.slice(0, 8)}
                    </div>
                    <div className={`mt-0.5 text-xs ${muted}`}>
                      Status:{" "}
                      <span className="capitalize text-neutral-200">
                        {String(r.status ?? "requested")}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/portal/parts`}
                    className="rounded-full border border-white/18 bg-black/40 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-black/70"
                  >
                    Parts
                  </Link>
                </div>

                <ul className={`mt-3 list-disc pl-5 text-sm ${muted} space-y-1`}>
                  {(r.items ?? []).slice(0, 4).map((it) => (
                    <li key={it.id}>
                      {it.description} × {Number((it as ItemRow).qty)}
                    </li>
                  ))}
                  {(r.items ?? []).length > 4 && (
                    <li>+ {(r.items ?? []).length - 4} more…</li>
                  )}
                </ul>

                <div className="mt-4 flex flex-wrap gap-2">
                  {/* If/when you add a portal detail page, change this link */}
                  <Link
                    href="/portal/history"
                    className="inline-flex items-center rounded-full border border-white/18 bg-black/40 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-black/70"
                  >
                    View history
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}