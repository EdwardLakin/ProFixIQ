// features/inspections/unified/custom-draft/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  InspectionSession,
  InspectionSection,
} from "@inspections/lib/inspection/types";
import InspectionUnifiedScreen from "@/features/inspections/unified/ui/InspectionUnifiedScreen";
import { saveInspectionSessionUnified } from "@/features/inspections/unified/data/saveSession";

function safeParseSections(raw: string | null): InspectionSection[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as InspectionSection[];
  } catch {
    return [];
  }
}

export default function UnifiedCustomDraftPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [session, setSession] = useState<InspectionSession | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const sessionIdFromUrl = sp.get("sessionId");
  const workOrderId = sp.get("workOrderId") ?? "";
  const vehicleId = sp.get("vehicleId") ?? "";
  const customerId = sp.get("customerId") ?? "";
  const templateId = sp.get("templateId") ?? "";
  const location = sp.get("location") ?? "";

  const sessionId = useMemo(
    () =>
      sessionIdFromUrl ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}`),
    [sessionIdFromUrl],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sectionsRaw = window.sessionStorage.getItem(
      "customInspection:sections",
    );
    const titleFromStorage =
      window.sessionStorage.getItem("customInspection:title") ?? "";
    const dutyClass =
      window.sessionStorage.getItem("customInspection:dutyClass") ?? "";

    const sections = safeParseSections(sectionsRaw);

    if (!sections.length) {
      setBootError("No staged sections found for custom inspection.");
      return;
    }

    const title =
      titleFromStorage ||
      sp.get("template") ||
      "Custom Inspection (Unified)";

    const now = new Date().toISOString();

    const unifiedSession: InspectionSession = {
      id: sessionId,
      workOrderId,
      vehicleId,
      customerId,
      templateId,
      templateName: title,
      location,
      currentSectionIndex: 0,
      currentItemIndex: 0,
      transcript: "",
      status: "in_progress",
      started: true,
      completed: false,
      isPaused: false,
      isListening: false,
      quote: [],
      lastUpdated: now,
      customer: {
        first_name: "",
        last_name: "",
        phone: "",
        email: "",
        address: "",
        city: "",
        province: "",
        postal_code: "",
      },
      vehicle: {
        year: "",
        make: "",
        model: "",
        vin: "",
        license_plate: "",
        mileage: "",
        color: "",
      },
      sections,
      meta: {
        dutyClass,
        source: "custom-builder",
      } as unknown as InspectionSession["meta"],
    };

    setSession(unifiedSession);
  }, [
    sessionId,
    workOrderId,
    vehicleId,
    customerId,
    templateId,
    location,
    sp,
  ]);

  const handleUpdateSession = async (patch: Partial<InspectionSession>) => {
    if (!session) return;

    const next: InspectionSession = {
      ...session,
      ...patch,
      lastUpdated: new Date().toISOString(),
    };

    setSession(next);

    try {
      await saveInspectionSessionUnified(next);
    } catch (e) {
      // keep UI quiet – this is still a stub
      // eslint-disable-next-line no-console
      console.debug("saveInspectionSessionUnified error (stub)", e);
    }
  };

  if (bootError) {
    return (
      <div className="min-h-[60vh] bg-gradient-to-b from-black via-slate-950 to-black px-4 py-6 text-sm text-red-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-500/40 bg-gradient-to-br from-red-950/70 via-black/80 to-black/95 px-4 py-4 shadow-[0_26px_60px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200/80">
            Custom Inspection
          </div>
          <p>{bootError}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-3 inline-flex items-center rounded-full border border-red-500/70 bg-red-500/90 px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-red-400"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[60vh] bg-gradient-to-b from-black via-slate-950 to-black px-4 py-6 text-sm text-neutral-200">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-black/70 px-4 py-4 shadow-[0_22px_55px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          Preparing unified inspection…
        </div>
      </div>
    );
  }

  const dutyLabel =
    (session.meta && "dutyClass" in session.meta && session.meta.dutyClass) ||
    "";

  return (
    <div className="min-h-[60vh] bg-gradient-to-b from-black via-slate-950 to-black px-4 py-6">
      <div className="mx-auto max-w-6xl rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-br from-black/80 via-slate-950/90 to-black/95 p-4 shadow-[0_26px_70px_rgba(0,0,0,0.98)] backdrop-blur-2xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-neutral-400">
              Unified Inspection
            </div>
            <p className="text-xs text-neutral-500">
              Built from custom template draft ·{" "}
              <span className="text-[color:var(--accent-copper-light,#fb923c)]">
                {session.templateName || "Custom Inspection"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-400">
            {dutyLabel && (
              <span className="rounded-full border border-[color:var(--accent-copper-soft,#fdba74)]/60 bg-black/70 px-3 py-1 font-semibold uppercase tracking-[0.18em] text-[color:var(--accent-copper-soft,#fdba74)]">
                Duty: {String(dutyLabel).toUpperCase()}
              </span>
            )}
            {session.location && (
              <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1 font-mono text-[10px] text-neutral-300">
                {session.location}
              </span>
            )}
          </div>
        </div>

        <InspectionUnifiedScreen
          session={session}
          onUpdateSession={handleUpdateSession}
        />
      </div>
    </div>
  );
}