// features/work-orders/mobile/MobileJobLineAdd.tsx (FULL FILE REPLACEMENT)
// ✅ Theme alignment only (glass-card / metal vibe)
// ❗ No logic changes

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import NewWorkOrderLineForm from "@/features/work-orders/components/NewWorkOrderLineForm";

type DB = Database;

type JobType = "diagnosis" | "inspection" | "maintenance" | "repair";

type Props = {
  workOrderId: string | null;
  vehicleId: string | null;
  defaultJobType?: JobType;
  onCreated?: () => void;
};

export function MobileJobLineAdd({
  workOrderId,
  vehicleId,
  defaultJobType = "diagnosis",
  onCreated,
}: Props): JSX.Element | null {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string | null>(null);

  // look up shop_id from the work order once
  useEffect(() => {
    if (!workOrderId) return;

    (async () => {
      const { data } = await supabase
        .from("work_orders")
        .select("shop_id")
        .eq("id", workOrderId)
        .maybeSingle();

      setShopId(data?.shop_id ?? null);
    })();
  }, [supabase, workOrderId]);

  if (!workOrderId) return null;

  return (
    <section className="glass-card rounded-2xl border border-white/12 bg-black/40 px-3 py-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-neutral-400">
          Add job line
        </div>
        {shopId ? (
          <span className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-neutral-300">
            shop {String(shopId).slice(0, 8)}…
          </span>
        ) : (
          <span className="text-[10px] text-neutral-500">—</span>
        )}
      </div>

      <div className="h-px w-full bg-white/10" />

      <div className="pt-3">
        <NewWorkOrderLineForm
          workOrderId={workOrderId}
          vehicleId={vehicleId}
          defaultJobType={defaultJobType}
          shopId={shopId}
          onCreated={onCreated}
        />
      </div>
    </section>
  );
}