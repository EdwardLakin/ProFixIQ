"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const supabase = createClientComponentClient<Database>();

export default function BookingConfirmation() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("wo");
  const [data, setData] = useState<{
    id: string; status: string | null; scheduled_at: string | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from("work_orders")
      .select("id, status, scheduled_at")
      .eq("id", id)
      .single()
      .then(({ data }) => setData(data));
  }, [id]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Appointment confirmed</h1>
      {data ? (
        <div className="space-y-1 text-sm text-neutral-300">
          <div><strong>Work Order:</strong> {data.id}</div>
          <div><strong>Status:</strong> {data.status ?? "awaiting"}</div>
          <div><strong>When:</strong> {data.scheduled_at ? new Date(data.scheduled_at).toLocaleString() : "Not set"}</div>
        </div>
      ) : (
        <p className="text-neutral-400">Loading...</p>
      )}

      <div className="flex gap-3">
        <button
          className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded"
          onClick={() => router.push("/portal")}
        >
          Go to portal
        </button>
        <button
          className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded"
          onClick={() => router.push(`/portal/booking`)}
        >
          Make another booking
        </button>
      </div>
    </div>
  );
}