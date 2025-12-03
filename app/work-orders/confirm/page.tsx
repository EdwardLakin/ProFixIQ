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
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    let closeTimer: ReturnType<typeof setTimeout> | undefined;

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

      if (data?.id) {
        const href = `/work-orders/${data.custom_id ?? data.id}?mode=view`;

        // Redirect back → then auto-close window
        redirectTimer = setTimeout(() => {
          router.replace(href);

          // Try to close after redirect (allowed if popup/tab was opened by app)
          closeTimer = setTimeout(() => {
            try {
              window.close();
            } catch {
              /* ignore browser restrictions */
            }
          }, 500);
        }, 1500);
      }
    })();

    return () => {
      if (redirectTimer) clearTimeout(redirectTimer);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [woId, supabase, router]);

  /* ---------------------------------------------------------------------- */
  /*                                UI STATES                               */
  /* ---------------------------------------------------------------------- */

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-6 text-white">
        <div className="mb-4 h-8 w-48 animate-pulse rounded-lg bg-black/30 backdrop-blur-sm border border-white/10" />
        <div className="h-24 animate-pulse rounded-lg bg-black/30 backdrop-blur-sm border border-white/10" />
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

  /* ---------------------------------------------------------------------- */
  /*                           THEMED CONFIRMATION UI                       */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="mx-auto max-w-xl p-6 text-white">
      <div className="
        rounded-2xl border border-green-500/40 
        bg-green-500/10 
        backdrop-blur-lg 
        shadow-xl shadow-black/40 
        p-6
      ">
        <div className="text-xl font-blackops text-green-300 tracking-wide">
          Approval Received ✓
        </div>

        <div className="mt-2 text-sm text-neutral-300">
          This work order is now marked{" "}
          <span className="font-semibold text-green-200">
            {(wo.status ?? "queued").replaceAll("_", " ")}
          </span>.
        </div>

        <div className="mt-5 flex gap-3">
          <Link
            href={viewHref}
            className="
              rounded-full 
              bg-orange-500 
              px-5 
              py-2 
              font-semibold 
              text-black 
              shadow 
              shadow-orange-900/40
              hover:bg-orange-400
              transition
            "
          >
            View Work Order
          </Link>

          <Link
            href="/work-orders"
            className="
              rounded-full 
              border border-white/10 
              bg-white/5 
              px-5 
              py-2 
              text-white 
              shadow-sm 
              hover:bg-white/10
              transition
              backdrop-blur-sm
            "
          >
            Back to List
          </Link>
        </div>

        <div className="mt-4 text-xs text-neutral-400">
          Redirecting and closing window…
        </div>
      </div>
    </div>
  );
}