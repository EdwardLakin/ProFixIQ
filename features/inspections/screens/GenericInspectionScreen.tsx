"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";

import PauseResumeButton from "@inspections/lib/inspection/PauseResume";
import StartListeningButton from "@inspections/lib/inspection/StartListeningButton";
import ProgressTracker from "@inspections/lib/inspection/ProgressTracker";
import useInspectionSession from "@inspections/hooks/useInspectionSession";

import { handleTranscriptFn } from "@inspections/lib/inspection/handleTranscript";
import { interpretCommand } from "@inspections/components/inspection/interpretCommand";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";
import { addWorkOrderLineFromSuggestion } from "@inspections/lib/inspection/addWorkOrderLine";

import type {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
  InspectionSection,
  InspectionSession,
  SessionCustomer,
  SessionVehicle,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

import SectionDisplay from "@inspections/lib/inspection/SectionDisplay";
import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";
import { startVoiceRecognition } from "@inspections/lib/inspection/voiceControl";

/* -------------------------- Generic helpers -------------------------- */

function toHeaderCustomer(c?: SessionCustomer | null) {
  return {
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    city: c?.city ?? "",
    province: c?.province ?? "",
    postal_code: c?.postal_code ?? "",
  };
}
function toHeaderVehicle(v?: SessionVehicle | null) {
  return {
    year: v?.year ?? "",
    make: v?.make ?? "",
    model: v?.model ?? "",
    vin: v?.vin ?? "",
    license_plate: v?.license_plate ?? "",
    mileage: v?.mileage ?? "",
    color: v?.color ?? "",
    unit_number: v?.unit_number ?? "",
    engine_hours: v?.engine_hours ?? "",
  };
}

/** Try to give a sensible unit hint for common labels */
function unitHintGeneric(label: string, mode: "metric" | "imperial"): string {
  const l = (label || "").toLowerCase();
  if (l.includes("pressure")) return mode === "imperial" ? "psi" : "kPa";
  if (l.includes("tread")) return mode === "metric" ? "mm" : "in";
  if (l.includes("pad") || l.includes("lining") || l.includes("shoe")) return mode === "metric" ? "mm" : "in";
  if (l.includes("rotor") || l.includes("drum")) return mode === "metric" ? "mm" : "in";
  if (l.includes("push rod")) return mode === "metric" ? "mm" : "in";
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";
  if (l.includes("leak rate")) return mode === "metric" ? "kPa/min" : "psi/min";
  if (l.includes("gov cut") || l.includes("warning")) return mode === "metric" ? "kPa" : "psi";
  return "";
}

/** Decide if a section should use the CornerGrid (measurement-heavy) */
function isMeasurementSection(title?: string) {
  const t = (title || "").toLowerCase();
  return (
    t.includes("measurement") ||
    t.includes("corner") ||
    t.includes("tire") ||
    t.includes("brake pad") ||
    t.includes("tread")
  );
}

/* -------------------------------------------------------------------- */
/* Page                                                                 */
/* -------------------------------------------------------------------- */

export default function GenericInspectionRunPage(): JSX.Element {
  const sp = useSearchParams();

  // Embed for iframe modal
  const isEmbed = useMemo(
    () =>
      ["1", "true", "yes"].includes(
        (sp.get("embed") || sp.get("compact") || "").toLowerCase()
      ),
    [sp]
  );

  // IDs & context
  const workOrderId = sp.get("workOrderId") || null;
  const workOrderLineId = sp.get("workOrderLineId") || "";
  const templateName = sp.get("template") || "Inspection";

  // Header (optional via URL)
  const customer: SessionCustomer = {
    first_name: sp.get("first_name") || "",
    last_name: sp.get("last_name") || "",
    phone: sp.get("phone") || "",
    email: sp.get("email") || "",
    address: sp.get("address") || "",
    city: sp.get("city") || "",
    province: sp.get("province") || "",
    postal_code: sp.get("postal_code") || "",
  };
  const vehicle: SessionVehicle = {
    year: sp.get("year") || "",
    make: sp.get("make") || "",
    model: sp.get("model") || "",
    vin: sp.get("vin") || "",
    license_plate: sp.get("license_plate") || "",
    mileage: sp.get("mileage") || "",
    color: sp.get("color") || "",
    unit_number: sp.get("unit_number") || "",
    engine_hours: sp.get("engine_hours") || "",
  };

  // Load from sessionStorage if built from Custom Builder
  const bootSections = useMemo<InspectionSection[]>(() => {
    try {
      const stash =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:sections")
          : null;
      if (stash) {
        const parsed = JSON.parse(stash) as InspectionSection[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return [
      {
        title: "General",
        items: [{ item: "Visual walkaround" }, { item: "Record warning lights" }],
      },
    ];
  }, [sp]);

  const inspectionId = useMemo(
    () => sp.get("inspectionId") || uuidv4(),
    [sp]
  );

  // UI state
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Session
  const initialSession = useMemo<Partial<InspectionSession>>(
    () => ({
      id: inspectionId,
      templateitem: templateName,
      status: "not_started" as InspectionStatus,
      isPaused: false,
      isListening: false,
      transcript: "",
      quote: [],
      customer,
      vehicle,
      sections: [],
    }),
    [inspectionId, templateName, customer, vehicle]
  );

  const {
    session,
    updateInspection,
    updateItem,
    updateSection,
    startSession,
    finishSession,
    resumeSession,
    pauseSession,
    addQuoteLine,
    updateQuoteLine,
  } = useInspectionSession(initialSession);

  // Start session & inject sections
  useEffect(() => {
    startSession(initialSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (session && (session.sections?.length ?? 0) === 0) {
      updateInspection({ sections: bootSections });
    }
  }, [session, bootSections, updateInspection]);

  // Persist
  useEffect(() => {
    if (!session) return;
    const key = `inspection-${inspectionId}`;
    localStorage.setItem(key, JSON.stringify(session));
  }, [session, inspectionId]);

  // Persist on unload
  useEffect(() => {
    const key = `inspection-${inspectionId}`;
    const persistNow = () => {
      try {
        const payload = session ?? initialSession;
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("beforeunload", persistNow);
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", persistNow);
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session, inspectionId, initialSession]);

  // Voice commands
  const handleTranscript = async (text: string): Promise<void> => {
    const commands: ParsedCommand[] = await interpretCommand(text);
    const sess = session;
    if (!sess) return;
    for (const command of commands) {
      await handleTranscriptFn({
        command,
        session: sess,
        updateInspection,
        updateItem,
        updateSection,
        finishSession,
      });
    }
  };

  const startListening = (): void => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    recognitionRef.current = startVoiceRecognition(async (text) => {
      await handleTranscript(text);
    });
    setIsListening(true);
  };
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  // AI Submit Flow
  const inFlightRef = useRef<Set<string>>(new Set());
  const isSubmittingAI = (secIdx: number, itemIdx: number): boolean =>
    inFlightRef.current.has(`${secIdx}:${itemIdx}`);

  const submitAIForItem = async (secIdx: number, itemIdx: number): Promise<void> => {
    if (!session) return;
    const key = `${secIdx}:${itemIdx}`;
    if (inFlightRef.current.has(key)) return;

    const it = session.sections[secIdx].items[itemIdx];
    const status = String(it.status ?? "").toLowerCase();
    const note = (it.notes ?? "").trim();

    if (!(status === "fail" || status === "recommend")) return;
    if (note.length === 0) {
      toast.error("Add a note before submitting.");
      return;
    }

    inFlightRef.current.add(key);
    try {
      const desc = it.item ?? (it as any).name ?? "Item";

      const id = uuidv4();
      const placeholder: QuoteLineItem = {
        id,
        description: desc,
        item: desc,
        name: desc,
        status: status as "fail" | "recommend",
        notes: it.notes ?? "",
        price: 0,
        laborTime: 0.5,
        laborRate: 0,
        editable: true,
        source: "inspection",
        value: it.value ?? "",
        photoUrls: it.photoUrls ?? [],
        aiState: "loading",
      };
      addQuoteLine(placeholder);

      const tId = toast.loading("Getting AI estimate…");
      const suggestion = await requestQuoteSuggestion({
        item: desc,
        notes: it.notes ?? "",
        section: session.sections[secIdx].title,
        status,
        vehicle: session.vehicle ?? undefined,
      });

      if (!suggestion) {
        updateQuoteLine(id, { aiState: "error" });
        toast.error("No AI suggestion available", { id: tId });
        return;
      }

      const partsTotal =
        suggestion.parts?.reduce((sum, p) => sum + (p.cost || 0), 0) ?? 0;
      const laborRate = suggestion.laborRate ?? 0;
      const laborTime = suggestion.laborHours ?? 0.5;
      const price = Math.max(0, partsTotal + laborRate * laborTime);

      updateQuoteLine(id, {
        price,
        laborTime,
        laborRate,
        ai: {
          summary: suggestion.summary,
          confidence: suggestion.confidence,
          parts: suggestion.parts ?? [],
        },
        aiState: "done",
      });

      if (workOrderId) {
        await addWorkOrderLineFromSuggestion({
          workOrderId,
          description: desc,
          section: session.sections[secIdx].title,
          status: status as "fail" | "recommend",
          suggestion,
          source: "inspection",
          jobType: "inspection",
        });
        toast.success("Added to work order (awaiting approval)", { id: tId });
      } else {
        toast.error("Missing work order id — saved locally only", { id: tId });
      }
    } catch (e) {
      console.error("Submit AI failed:", e);
      toast.error("Couldn't add to work order");
    } finally {
      inFlightRef.current.delete(key);
    }
  };

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="p-4 text-white">Loading inspection…</div>;
  }

  // Layout
  const shell = isEmbed ? "mx-auto max-w-[1100px] px-3 pb-8" : "px-4 pb-14";
  const controlsGap = "mb-4 grid grid-cols-3 gap-2";
  const card =
    "rounded-lg border border-zinc-800 bg-zinc-900 " +
    (isEmbed ? "p-3 mb-6" : "p-4 mb-8");
  const sectionTitle = "text-xl font-semibold text-orange-400 text-center";
  const hint = "text-xs text-zinc-400" + (isEmbed ? " mt-1 block text-center" : "");

  const Body = (
    <div className={shell}>
      {isEmbed && (
        <style jsx global>{`
          header[data-app-header],
          nav[data-app-nav],
          aside[data-app-sidebar],
          footer[data-app-footer],
          .app-shell-nav,
          .app-sidebar {
            display: none !important;
          }
        `}</style>
      )}

      <div className={card}>
        <div className="text-center text-lg font-semibold text-orange-400">
          {templateName}
        </div>
        <CustomerVehicleHeader
          templateName=""
          customer={toHeaderCustomer(session.customer ?? null)}
          vehicle={toHeaderVehicle(session.vehicle ?? null)}
        />
      </div>

      <div className={controlsGap}>
        <StartListeningButton
          isListening={isListening}
          setIsListening={setIsListening}
          onStart={startListening}
        />
        <PauseResumeButton
          isPaused={isPaused}
          isListening={isListening}
          setIsListening={setIsListening}
          onPause={(): void => {
            setIsPaused(true);
            pauseSession();
            try {
              recognitionRef.current?.stop();
            } catch {}
          }}
          onResume={(): void => {
            setIsPaused(false);
            resumeSession();
            recognitionRef.current = startVoiceRecognition(handleTranscript);
          }}
          recognitionInstance={
            recognitionRef.current as unknown as SpeechRecognition | null
          }
          onTranscript={handleTranscript}
          setRecognitionRef={(instance: SpeechRecognition | null): void => {
            (
              recognitionRef as React.MutableRefObject<SpeechRecognition | null>
            ).current = instance ?? null;
          }}
        />
        <button
          onClick={(): void => setUnit(unit === "metric" ? "imperial" : "metric")}
          className="w-full rounded bg-zinc-700 py-2 text-white hover:bg-zinc-600"
        >
          Unit: {unit === "metric" ? "Metric" : "Imperial"}
        </button>
      </div>

      <ProgressTracker
        currentItem={session.currentItemIndex}
        currentSection={session.currentSectionIndex}
        totalSections={session.sections.length}
        totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
      />

      <InspectionFormCtx.Provider value={{ updateItem }}>
        {session.sections.map((section: InspectionSection, sectionIndex: number) => {
          const useGrid = isMeasurementSection(section.title);
          return (
            <div key={`${section.title}-${sectionIndex}`} className={card}>
              <h2 className={sectionTitle}>{section.title}</h2>
              {useGrid && (
                <span className={hint}>
                  {unit === "metric" ? "Enter mm / kPa / N·m" : "Enter in / psi / ft·lb"}
                </span>
              )}

              <div className={isEmbed ? "mt-3" : "mt-4"}>
                {useGrid ? (
                  <CornerGrid
                    sectionIndex={sectionIndex}
                    items={section.items.map((it) => ({
                      ...it,
                      unit: it.unit || unitHintGeneric(it.item ?? "", unit),
                    }))}
                  />
                ) : (
                  <SectionDisplay
                    title=""
                    section={section}
                    sectionIndex={sectionIndex}
                    showNotes
                    showPhotos
                    onUpdateStatus={(
                      secIdx: number,
                      itemIdx: number,
                      status: InspectionItemStatus
                    ) => {
                      updateItem(secIdx, itemIdx, { status });
                    }}
                    onUpdateNote={(secIdx, itemIdx, note) => {
                      updateItem(secIdx, itemIdx, { notes: note });
                    }}
                    onUpload={(photoUrl, secIdx, itemIdx) => {
                      const prev =
                        session.sections[secIdx].items[itemIdx].photoUrls ?? [];
                      updateItem(secIdx, itemIdx, {
                        photoUrls: [...prev, photoUrl],
                      });
                    }}
                    /* Explicit AI submit; requires a note */
                    requireNoteForAI
                    onSubmitAI={(secIdx, itemIdx) => {
                      void submitAIForItem(secIdx, itemIdx);
                    }}
                    isSubmittingAI={isSubmittingAI}
                  />
                )}
              </div>
            </div>
          );
        })}
      </InspectionFormCtx.Provider>

      <div
        className={
          "flex items-center justify-between gap-4 " + (isEmbed ? "mt-6" : "mt-8")
        }
      >
        <div className="flex items-center gap-3">
          <SaveInspectionButton session={session} workOrderLineId={workOrderLineId} />
          <FinishInspectionButton session={session} workOrderLineId={workOrderLineId} />
        </div>

        {!workOrderLineId && (
          <div className="text-xs text-red-400">
            Missing <code>workOrderLineId</code> — save/finish will be blocked.
          </div>
        )}

        <div className="ml-auto text-xs text-zinc-400">
          P = PASS, F = FAIL, NA = Not Applicable
        </div>
      </div>
    </div>
  );

  if (isEmbed) return Body;
  return Body;
}