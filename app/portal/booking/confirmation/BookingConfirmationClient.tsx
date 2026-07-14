"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";


export default function BookingConfirmationClient() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabase(), []);

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
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 text-[color:var(--theme-text-primary)] shadow-card backdrop-blur-xl">
      <h1
        className="text-lg tracking-[0.18em] text-[var(--accent-copper-light)]"
        style={{ fontFamily: "var(--font-blackops), system-ui, sans-serif" }}
      >
        Appointment confirmed
      </h1>

      {data ? (
        <div className="space-y-1 text-sm text-[color:var(--theme-text-primary)]">
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
        <p className="text-sm text-[color:var(--theme-text-secondary)]">Loading…</p>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-inset)]"
          onClick={() => router.push("/portal")}
        >
          Go to portal
        </button>
        <button
          className="rounded-full border border-[rgba(193,102,59,0.35)] bg-[var(--accent-copper)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-on-accent)] transition hover:brightness-110"
          onClick={() => router.push("/portal/booking")}
        >
          Make another booking
        </button>
      </div>
    </div>
  );
}
