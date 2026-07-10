"use client";

import { useEffect, useMemo, useState } from "react";
import PunchInOutButton from "@shared/components/PunchInOutButton";
import { fetchMobileShiftState } from "@/features/mobile/shifts/client";

type ShiftAction = "start_shift" | "end_shift";

function safeMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

/**
 * Deprecated legacy desktop wrapper. Shift persistence is routed through
 * /api/mobile/shifts so tech_shifts and punch_events fail or succeed together
 * as visibly as the current non-transactional API allows.
 */
export default function PunchController(): JSX.Element {
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshShift(): Promise<void> {
    const state = await fetchMobileShiftState();
    setActiveShiftId(state.shiftId);
  }

  useEffect(() => {
    void refreshShift().catch((error) => setErrorMessage(safeMsg(error, "Failed to load shift state.")));
  }, []);

  useEffect(() => {
    if (activeShiftId) document.body.classList.add("on-shift");
    else document.body.classList.remove("on-shift");
    return () => document.body.classList.remove("on-shift");
  }, [activeShiftId]);

  async function punch(action: ShiftAction): Promise<void> {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/mobile/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; shiftId?: string | null } | null;
      if (!res.ok || !body?.ok) throw new Error(body?.error ?? `Failed to ${action === "start_shift" ? "punch in" : "punch out"}.`);
      setActiveShiftId(body.shiftId ?? null);
      window.dispatchEvent(new CustomEvent("wol:refresh"));
    } catch (error) {
      setErrorMessage(safeMsg(error, action === "start_shift" ? "Failed to punch in." : "Failed to punch out."));
      await refreshShift().catch(() => undefined);
    } finally {
      setLoading(false);
    }
  }

  const activeJob = useMemo(() => {
    return activeShiftId ? { id: activeShiftId, vehicle: "On Shift" } : null;
  }, [activeShiftId]);

  return (
    <div className="space-y-2">
      {errorMessage ? (
        <div className="rounded-md border border-red-500/40 bg-red-950/70 px-3 py-2 text-xs text-red-100">
          {errorMessage}
        </div>
      ) : null}
      <PunchInOutButton
        activeJob={activeJob}
        onPunchIn={() => punch("start_shift")}
        onPunchOut={() => punch("end_shift")}
        isLoading={loading}
      />
    </div>
  );
}
