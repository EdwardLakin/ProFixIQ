"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

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
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import SectionDisplay from "@inspections/lib/inspection/SectionDisplay";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import { startVoiceRecognition } from "@inspections/lib/inspection/voiceControl";
import toast from "react-hot-toast";

/* ---------- Props for screen usage (modal + page) ---------- */
type ScreenProps = {
  embed?: boolean;
  template?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
};

/* ---------- Sections ---------- */
function buildHydraulicMeasurementsSection(): InspectionSection {
  return {
    title: "Measurements (Hydraulic)",
    items: [
      { item: "LF Tire Pressure", unit: "psi", value: "" },
      { item: "RF Tire Pressure", unit: "psi", value: "" },
      { item: "LR Tire Pressure", unit: "psi", value: "" },
      { item: "RR Tire Pressure", unit: "psi", value: "" },
      { item: "LF Tire Tread", unit: "mm", value: "" },
      { item: "RF Tire Tread", unit: "mm", value: "" },
      { item: "LR Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "LR Tire Tread (Inner)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Inner)", unit: "mm", value: "" },
      { item: "LF Brake Pad Thickness", unit: "mm", value: "" },
      { item: "RF Brake Pad Thickness", unit: "mm", value: "" },
      { item: "LR Brake Pad Thickness", unit: "mm", value: "" },
      { item: "RR Brake Pad Thickness", unit: "mm", value: "" },
      { item: "LF Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "RF Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "LR Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "RR Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "Wheel Torque (after road test)", unit: "ft·lb", value: "" },
    ],
  };
}
function buildLightsSection(): InspectionSection {
  return {
    title: "Lighting & Reflectors",
    items: [
      { item: "Headlights (high/low beam)" },
      { item: "Turn signals / flashers" },
      { item: "Brake lights" },
      { item: "Tail lights" },
      { item: "Reverse lights" },
      { item: "License plate light" },
      { item: "Clearance / marker lights" },
      { item: "Reflective tape / reflectors" },
      { item: "Hazard switch function" },
    ],
  };
}
function buildBrakesSection(): InspectionSection {
  return {
    title: "Brakes",
    items: [
      { item: "Front brake pads" },
      { item: "Rear brake pads" },
      { item: "Brake fluid level" },
      { item: "Brake lines and hoses" },
      { item: "ABS wiring / sensors" },
      { item: "Brake warning lights" },
    ],
  };
}
function buildSuspensionSection(): InspectionSection {
  return {
    title: "Suspension",
    items: [
      { item: "Front springs (coil/leaf)" },
      { item: "Rear springs (coil/leaf)" },
      { item: "Shocks / struts" },
      { item: "Control arms / ball joints" },
      { item: "Sway bar bushings / links" },
    ],
  };
}
function buildDrivelineSection(): InspectionSection {
  return {
    title: "Driveline",
    items: [
      { item: "Driveshaft / U-joints" },
      { item: "Center support bearing" },
      { item: "CV shafts / joints" },
      { item: "Transmission leaks / mounts" },
      { item: "Transfer case leaks / mounts" },
      { item: "Slip yokes / seals" },
      { item: "Axle seals / leaks" },
      { item: "Differential leaks / play" },
    ],
  };
}

/* ---------- Units helpers ---------- */
function unitForHydraulic(label: string, mode: "metric" | "imperial"): string {
  const l = label.toLowerCase();
  if (l.includes("pressure")) return mode === "imperial" ? "psi" : "kPa";
  if (l.includes("tire tread")) return mode === "metric" ? "mm" : "in";
  if (l.includes("pad thickness")) return mode === "metric" ? "mm" : "in";
  if (l.includes("rotor")) return mode === "metric" ? "mm" : "in";
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";
  return "";
}
function applyUnitsHydraulic(
  sections: InspectionSection[],
  mode: "metric" | "imperial"
): InspectionSection[] {
  return sections.map((s) => {
    if ((s.title || "").toLowerCase().includes("measurements")) {
      const items = s.items.map((it) => ({
        ...it,
        unit: unitForHydraulic(it.item ?? "", mode) || it.unit || "",
      }));
      return { ...s, items };
    }
    return s;
  });
}

/* ---------- Screen (component) ---------- */
export default function Maintenance50Screen(props: ScreenProps): JSX.Element {
  const searchParams = useSearchParams();
  const p = props.params ?? {};

  // prefer params passed from modal, then URL
  const get = (k: string): string => {
    const v = p[k];
    if (v !== undefined && v !== null) return String(v);
    return searchParams.get(k) ?? "";
  };

  // detect true iframe usage only
  const inIframe = typeof window !== "undefined" && window.self !== window.top;

  // compact spacing when embedded from modal
  const compact =
    !!props.embed ||
    ["1", "true", "yes"].includes((get("embed") || get("compact")).toLowerCase());

  const workOrderLineId = get("workOrderLineId") || null;
  const workOrderId = get("workOrderId") || null;
  const inspectionId = useMemo<string>(() => get("inspectionId") || uuidv4(), [p, searchParams]);

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName: string = props.template || get("template") || "maintenance50";

  // minimal session (customer/vehicle omitted – they’re tied to the WO)
  const initialSession = useMemo<Partial<InspectionSession>>(
    () => ({
      id: inspectionId,
      templateitem: templateName,
      status: "not_started" as InspectionStatus,
      isPaused: false,
      isListening: false,
      transcript: "",
      quote: [],
      sections: [],
    }),
    [inspectionId, templateName]
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

  // ---- AI submit guarding ----
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
      const desc = it.item ?? it.name ?? "Item";

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

  // ---- boot/restore ----
  useEffect(() => {
    const key = `inspection-${inspectionId}`;
    const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as InspectionSession;
        updateInspection(parsed);
      } catch {
        startSession(initialSession);
      }
    } else {
      startSession(initialSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist
  useEffect(() => {
    if (session) {
      const key = `inspection-${inspectionId}`;
      localStorage.setItem(key, JSON.stringify(session));
    }
  }, [session, inspectionId]);

  // persist on unload
  useEffect(() => {
    const key = `inspection-${inspectionId}`;
    const persistNow = () => {
      try {
        localStorage.setItem(key, JSON.stringify(session ?? initialSession));
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

  // build sections once
  useEffect(() => {
    if (!session) return;
    if ((session.sections?.length ?? 0) > 0) return;
    const next: InspectionSection[] = [
      buildHydraulicMeasurementsSection(),
      buildLightsSection(),
      buildBrakesSection(),
      buildSuspensionSection(),
      buildDrivelineSection(),
    ];
    updateInspection({ sections: applyUnitsHydraulic(next, unit) as typeof session.sections });
  }, [session, updateInspection, unit]);

  // re-apply units
  useEffect(() => {
    if (!session?.sections?.length) return;
    updateInspection({ sections: applyUnitsHydraulic(session.sections, unit) as typeof session.sections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  // transcript
  const handleTranscript = async (text: string): Promise<void> => {
    const commands: ParsedCommand[] = await interpretCommand(text);
    const sess: InspectionSession | undefined = session ?? undefined;
    if (!sess) return;
    for (const command of commands) {
      await handleTranscriptFn({ command, session: sess, updateInspection, updateItem, updateSection, finishSession });
    }
  };

  // speech
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

  // only inject isolation CSS when truly inside an iframe
  useEffect(() => {
    if (!inIframe) return;
    try {
      document.documentElement.classList.add("inspection-embed");
      document.body?.classList.add("inspection-embed");
      const CSS = `
        html.inspection-embed, body.inspection-embed { background:#000 !important; overflow:auto !important; }
        .inspection-embed header,
        .inspection-embed nav,
        .inspection-embed aside,
        .inspection-embed footer,
        .inspection-embed [data-app-chrome],
        .inspection-embed .app-shell,
        .inspection-embed .global-header,
        .inspection-embed .global-footer { display:none !important; visibility:hidden !important; }
        .inspection-embed main,
        .inspection-embed #__next > *:not(main) { margin:0 !important; padding:0 !important; width:100% !important; max-width:none !important; }
      `;
      const tag = document.createElement("style");
      tag.setAttribute("data-inspection-embed-style", "1");
      tag.appendChild(document.createTextNode(CSS));
      document.head.appendChild(tag);
      const mo = new MutationObserver(() => {
        if (!document.querySelector('style[data-inspection-embed-style="1"]')) {
          const t2 = document.createElement("style");
          t2.setAttribute("data-inspection-embed-style", "1");
          t2.appendChild(document.createTextNode(CSS));
          document.head.appendChild(t2);
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      return () => mo.disconnect();
    } catch {}
  }, [inIframe]);

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="p-4 text-white">Loading inspection…</div>;
  }

  const isMeasurements = (t?: string): boolean => (t || "").toLowerCase().includes("measurements");

  // compact spacing when embed flag is set (no global CSS)
  const shell = compact ? "mx-auto max-w-[1100px] px-3 pb-8" : "px-4 pb-14";
  const controlsGap = "mb-4 grid grid-cols-3 gap-2";
  const card =
    "rounded-lg border border-zinc-800 bg-zinc-900 " + (compact ? "p-3 mb-6" : "p-4 mb-8");
  const sectionTitle = "text-xl font-semibold text-orange-400 text-center";
  const hint = "text-xs text-zinc-400" + (compact ? " mt-1 block text-center" : "");

  return (
    <div className={shell}>
      {/* Title only (Customer/Vehicle removed) */}
      <div className={card}>
        <div className="text-center text-lg font-semibold text-orange-400">
          {templateName === "maintenance50" ? "Maintenance 50" : templateName}
        </div>
      </div>

      <div className={controlsGap}>
        <StartListeningButton isListening={isListening} setIsListening={setIsListening} onStart={startListening} />
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
          recognitionInstance={recognitionRef.current as unknown as SpeechRecognition | null}
          onTranscript={handleTranscript}
          setRecognitionRef={(instance: SpeechRecognition | null): void => {
            (recognitionRef as React.MutableRefObject<SpeechRecognition | null>).current = instance ?? null;
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
        {session.sections.map((section: InspectionSection, sectionIndex: number) => (
          <div key={`${section.title}-${sectionIndex}`} className={card}>
            <h2 className={sectionTitle}>{section.title}</h2>
            {isMeasurements(section.title) && (
              <span className={hint}>
                {unit === "metric" ? "Enter mm / kPa / N·m" : "Enter in / psi / ft·lb"}
              </span>
            )}

            <div className={compact ? "mt-3" : "mt-4"}>
              {isMeasurements(section.title) ? (
                <CornerGrid sectionIndex={sectionIndex} items={section.items} />
              ) : (
                <SectionDisplay
                  title=""
                  section={section}
                  sectionIndex={sectionIndex}
                  showNotes
                  showPhotos
                  onUpdateStatus={(secIdx: number, itemIdx: number, status: InspectionItemStatus): void => {
                    updateItem(secIdx, itemIdx, { status });
                  }}
                  onUpdateNote={(secIdx: number, itemIdx: number, note: string): void => {
                    updateItem(secIdx, itemIdx, { notes: note });
                  }}
                  onUpload={(photoUrl: string, secIdx: number, itemIdx: number): void => {
                    const prev = session.sections[secIdx].items[itemIdx].photoUrls ?? [];
                    updateItem(secIdx, itemIdx, { photoUrls: [...prev, photoUrl] });
                  }}
                  requireNoteForAI
                  onSubmitAI={(secIdx, itemIdx) => void submitAIForItem(secIdx, itemIdx)}
                  isSubmittingAI={isSubmittingAI}
                />
              )}
            </div>
          </div>
        ))}
      </InspectionFormCtx.Provider>

      <div className={"flex items-center justify-between gap-4 " + (compact ? "mt-6" : "mt-8")}>
        <div className="flex items-center gap-3">
          <SaveInspectionButton session={session} workOrderLineId={workOrderLineId ?? ""} />
          <FinishInspectionButton session={session} workOrderLineId={workOrderLineId ?? ""} />
        </div>

        {!workOrderLineId && (
          <div className="text-xs text-red-400">
            Missing <code>workOrderLineId</code> in URL — save/finish will be blocked.
          </div>
        )}

        <div className="ml-auto text-xs text-zinc-400">P = PASS, F = FAIL, NA = Not Applicable</div>
      </div>
    </div>
  );
}