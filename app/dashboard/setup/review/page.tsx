"use client";

import { useEffect, useMemo, useState } from "react";

type ReviewItem = {
  id: string;
  domain: string;
  issue_type: string;
  summary: string;
  raw_payload: Record<string, unknown>;
  suggested_matches: unknown;
  status: "pending" | "resolved" | "dismissed";
  resolution_action: "linked_to_existing" | "created_new" | "ignored" | null;
  resolved_at: string | null;
  created_at: string;
};

const domains = ["", "customer", "vehicle", "part", "work_order", "invoice", "history"];

export default function ShopBoostReviewPage() {
  const [domain, setDomain] = useState("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (domain) params.set("domain", domain);
    params.set("status", "pending");
    const res = await fetch(`/api/shop-boost/review-items?${params.toString()}`, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: ReviewItem[] };
    setItems(json.ok ? json.items ?? [] : []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [domain]);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, number>>((acc, item) => {
      acc[item.domain] = (acc[item.domain] ?? 0) + 1;
      return acc;
    }, {});
  }, [items]);

  const resolve = async (id: string, resolution_action: "linked_to_existing" | "created_new" | "ignored") => {
    await fetch(`/api/shop-boost/review-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: resolution_action === "ignored" ? "dismissed" : "resolved", resolution_action }),
    });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <h1 className="text-xl font-semibold text-white">Shop Boost Data Review</h1>
        <p className="mt-1 text-sm text-neutral-300">Every unresolved import row is listed here for explicit review and action.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-neutral-300">
          {Object.entries(grouped).map(([key, count]) => (
            <span key={key} className="rounded-full border border-white/15 px-2 py-1">{key}: {count}</span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <label className="text-xs uppercase tracking-[0.16em] text-neutral-400">Filter by domain</label>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
        >
          {domains.map((d) => (
            <option key={d || "all"} value={d}>
              {d || "all domains"}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-neutral-400">Loading review queue…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-emerald-300/20 bg-emerald-950/20 p-3 text-sm text-emerald-100">No pending review items.</div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-white/10 bg-black/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{item.summary}</div>
                  <div className="text-xs text-neutral-400">{item.domain} • {item.issue_type}</div>
                </div>
                <div className="flex gap-2 text-xs">
                  <button className="rounded border border-sky-300/40 px-2 py-1 text-sky-100" onClick={() => void resolve(item.id, "linked_to_existing")}>Link to existing</button>
                  <button className="rounded border border-emerald-300/40 px-2 py-1 text-emerald-100" onClick={() => void resolve(item.id, "created_new")}>Create new</button>
                  <button className="rounded border border-white/25 px-2 py-1 text-neutral-200" onClick={() => void resolve(item.id, "ignored")}>Ignore</button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Raw imported data</div>
                  <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.raw_payload ?? {}, null, 2)}</pre>
                </div>
                <div>
                  <div className="mb-1 text-xs uppercase tracking-[0.14em] text-neutral-500">Suggested matches / system data</div>
                  <pre className="max-h-64 overflow-auto rounded border border-white/10 bg-black/40 p-2 text-xs text-neutral-200">{JSON.stringify(item.suggested_matches ?? {}, null, 2)}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
