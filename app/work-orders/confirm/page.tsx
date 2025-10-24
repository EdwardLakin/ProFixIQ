"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      if (!woId) {
        setErr("Missing work order id.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("work_orders")
        .select("id, custom_id, shop_id, status")
        .eq("id", woId)
        .maybeSingle();

      if (error) setErr(error.message);
      setWo((data as WorkOrder | null) ?? null);
      setLoading(false);

      // gentle auto-redirect after a moment
      if (data?.id) {
        const href = `/work-orders/${data.custom_id ?? data.id}?mode=view`;
        timeoutId = setTimeout(() => router.replace(href), 1500);
      }
    })();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [woId, supabase, router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-white">
        <div className="mb-4 h-8 w-48 animate-pulse rounded bg-neutral-800" />
        <div className="h-24 animate-pulse rounded bg-neutral-800" />
      </div>
    );
  }

  if (err || !wo) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-red-400">
        {err ?? "Work order not found."}
      </div>
    );
  }

  const viewHref = `/work-orders/${wo.custom_id ?? wo.id}?mode=view`;

  return (
    <div className="mx-auto max-w-xl p-6 text-white">
      <div className="rounded border border-green-500/40 bg-green-500/10 p-4">
        <div className="text-lg font-semibold text-green-300">Approval received ✅</div>
        <div className="mt-1 text-sm text-neutral-300">
          This work order is now marked{" "}
          <span className="font-semibold">
            {(wo.status ?? "queued").replaceAll("_", " ")}
          </span>.
        </div>

        <div className="mt-4 flex gap-2">
          <Link
            href={viewHref}
            className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600"
          >
            View Work Order
          </Link>
          <Link
            href="/work-orders"
            className="rounded border border-neutral-700 px-4 py-2 text-white hover:bg-neutral-800"
          >
            Back to List
          </Link>
        </div>

        <div className="mt-3 text-xs text-neutral-400">You’ll be redirected shortly…</div>
      </div>
    </div>
  );
}