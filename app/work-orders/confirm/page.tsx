// app/work-orders/confirm/page.tsx
"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];

export default function ApprovalConfirmPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();
  const search = useSearchParams();
  const woId = search.get("woId");

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!woId) {
        setErr("Missing work order id.");
        setLoading(false);
        return;
      }
      setErr(null);
      setLoading(true);
      try {
        const { data: w, error } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", woId)
          .maybeSingle();

        if (error) throw error;
        if (!w) throw new Error("Work order not found.");

        // Optional: scope the RLS shop context (ignore failures in client)
        if (w.shop_id) {
          try {
            await supabase.rpc("set_current_shop_id", { p_shop_id: w.shop_id });
          } catch {
            // non-critical on client
          }
        }

        setWo(w);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Work order not found.");
      } finally {
        setLoading(false);
      }
    })();
  }, [woId, supabase]);

  return (
    <div className="mx-auto max-w-2xl p-6 text-white">
      <button onClick={() => router.back()} className="mb-3 text-sm text-orange-400 hover:underline">
        ← Back
      </button>

      <h1 className="text-2xl font-semibold">Approval</h1>

      {loading ? (
        <div className="mt-6 h-24 animate-pulse rounded bg-neutral-800" />
      ) : err ? (
        <div className="mt-4 rounded border border-red-500/40 bg-red-500/10 p-3">{err}</div>
      ) : (
        <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-lg font-semibold text-green-400">Approved & Saved</div>
          <div className="mt-1 text-sm text-neutral-300">
            Work order{" "}
            <span className="font-mono">
              {wo?.custom_id ? `#${wo.custom_id}` : `#${wo?.id.slice(0, 8)}`}
            </span>{" "}
            has been updated.
          </div>
          <div className="mt-3">
            <a
              className="inline-block rounded border border-orange-500 px-3 py-1 text-orange-300 hover:bg-orange-500/10"
              href={`/work-orders/${wo?.id}`}
            >
              View Work Order
            </a>
          </div>
        </div>
      )}
    </div>
  );
}