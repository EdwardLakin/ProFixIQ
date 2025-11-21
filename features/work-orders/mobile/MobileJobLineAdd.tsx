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
}: Props) {
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

  if (!workOrderId) {
    return null;
  }

  return (
    <NewWorkOrderLineForm
      workOrderId={workOrderId}
      vehicleId={vehicleId}
      defaultJobType={defaultJobType}
      shopId={shopId}
      onCreated={onCreated}
    />
  );
}