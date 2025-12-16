"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export default function BookingConfirmationClient() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const id = params.get("wo");
  const [data, setData] = useState<{
    id: string;
    status: string | null;
    scheduled_at: string | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, status, scheduled_at")
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        setData(null);
        return;
      }
      setData(data);
    })();
  }, [id, supabase]);

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-white/10 bg-black/30 p-5 text-white backdrop-blur-md shadow-card">
      <h1 className="text-lg font-blackops uppercase tracking-[0.18em] text-neutral-300">
        Appointment confirmed
      </h1>

      {data ? (
        <div className="space-y-1 text-sm text-neutral-200">
          <div>
            <strong>Work Order:</strong> {data.id}
          </div>
          <div>
            <strong>Status:</strong> {data.status ?? "awaiting"}
          </div>
          <div>
            <strong>When:</strong>{" "}
            {data.scheduled_at
              ? new Date(data.scheduled_at).toLocaleString()
              : "Not set"}
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-400">Loading…</p>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          className="rounded-lg border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-black/55"
          onClick={() => router.push("/portal")}
        >
          Go to portal
        </button>
        <button
          className="rounded-lg border border-orange-600 px-4 py-2 text-sm font-semibold text-orange-300 transition hover:bg-orange-600 hover:text-black"
          onClick={() => router.push("/portal/booking")}
        >
          Make another booking
        </button>
      </div>
    </div>
  );
}