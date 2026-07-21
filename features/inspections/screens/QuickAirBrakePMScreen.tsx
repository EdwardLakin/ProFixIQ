// features/inspections/screens/Maintenance50AirScreen.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";

import PauseResumeButton from "@inspections/lib/inspection/PauseResume";
import StartListeningButton from "@inspections/lib/inspection/StartListeningButton";
import ProgressTracker from "@inspections/lib/inspection/ProgressTracker";
import useInspectionSession from "@inspections/hooks/useInspectionSession";
import { useInspectionAutosave } from "@inspections/hooks/useInspectionAutosave";
import { getInspectionOfflineDraft } from "@inspections/lib/inspection/offlineDrafts";

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
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import { startVoiceRecognition } from "@inspections/lib/inspection/voiceControl";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

/* ---------- Props for screen usage (modal + page) ---------- */
type ScreenProps = {
  embed?: boolean;
  template?: string;
  params?: Record<string, string | number | boolean | null | undefined>;
};

/* ---------- Sections ---------- */
/**
 * Air version uses the same corner layout as Maintenance 50:
 *  - Tire Pressure
 *  - Tire Tread (overall)
 *  - Tire Tread (Inner)
 *  - Tire Tread (Outer)
 *  - Brake Pad Thickness
 *  - Rotor Condition / Thickness
 *  - Wheel Torque (after road test)
 * Each metric has LF / RF / LR / RR so CornerGrid is fully populated.
 */
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
      { item: "LR Tire Tread", unit: "mm", value: "" },
      { item: "RR Tire Tread", unit: "mm", value: "" },

      { item: "LF Tire Tread (Inner)", unit: "mm", value: "" },
      { item: "RF Tire Tread (Inner)", unit: "mm", value: "" },
      { item: "LR Tire Tread (Inner)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Inner)", unit: "mm", value: "" },

      { item: "LF Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "RF Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "LR Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Outer)", unit: "mm", value: "" },

      { item: "LF Brake Pad Thickness", unit: "mm", value: "" },
      { item: "RF Brake Pad Thickness", unit: "mm", value: "" },
      { item: "LR Brake Pad Thickness", unit: "mm", value: "" },
      { item: "RR Brake Pad Thickness", unit: "mm", value: "" },

      { item: "LF Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "RF Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "LR Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "RR Rotor Condition / Thickness", unit: "mm", value: "" },

      { item: "LF Wheel Torque (after road test)", unit: "ft·lb", value: "" },
      { item: "RF Wheel Torque (after road test)", unit: "ft·lb", value: "" },
      { item: "LR Wheel Torque (after road test)", unit: "ft·lb", value: "" },
      { item: "RR Wheel Torque (after road test)", unit: "ft·lb", value: "" },
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
  if (l.includes("torque")) return mode === "metric" ? "n·m" : "ft·lb";
  return "";
}

function applyUnitsHydraulic(
  sections: InspectionSection[],
  mode: "metric" | "imperial",
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
export default function Maintenance50AirScreen(props: ScreenProps): JSX.Element {
  const searchParams = useSearchParams();
  const p = props.params ?? {};
  const rootRef = useRef<HTMLDivElement | null>(null);

  const get = (k: string): string => {
    const v = p[k];
    if (v !== undefined && v !== null) return String(v);
    return searchParams.get(k) ?? "";
  };

  // 🔸 only mobile companion gets voice
  const isMobileView = (get("view") || "").toLowerCase() === "mobile";

  const isEmbed =
    !!props.embed ||
    ["1", "true", "yes"].includes(
      (get("embed") || get("compact")).toLowerCase(),
    );

  const workOrderLineId = get("workOrderLineId") || null;
  const workOrderId = get("workOrderId") || null;

  const inspectionId = useMemo<string>(
    () => get("inspectionId") || uuidv4(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams],
  );
  const draftKey = `inspection-${workOrderLineId ?? inspectionId}`;

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [draftBootLoaded, setDraftBootLoaded] = useState(false);
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);
  const [recoveryOperationKey, setRecoveryOperationKey] = useState<
    string | undefined
  >(undefined);
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const draftReady = draftBootLoaded && loadedDraftKey === draftKey;
  const draftReadyRef = useRef(false);

  const stopRecognition = (): void => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    setIsListening(false);
  };

  const applyLockedState = (nextLocked: boolean): void => {
    // Realtime can lock the row while a voice callback is still running. Update
    // the ref first so every mutation wrapper sees the lock immediately.
    isLockedRef.current = nextLocked;
    setIsLocked(nextLocked);
    if (nextLocked) stopRecognition();
  };

  const templateName: string =
    props.template || get("template") || "Maintenance 50 (Air)";

  const initialSession = useMemo<Partial<InspectionSession>>(
    () => ({
      id: inspectionId,
      workOrderId,
      workOrderLineId,
      templateitem: templateName,
      status: "not_started" as InspectionStatus,
      isPaused: false,
      isListening: false,
      transcript: "",
      quote: [],
      sections: [],
    }),
    [inspectionId, templateName, workOrderId, workOrderLineId],
  );

  const {
    session,
    updateInspection: updateSessionInspection,
    updateItem: updateSessionItem,
    updateSection: updateSessionSection,
    startSession: startInspectionSession,
    replaceSession,
    finishSession: finishInspectionSession,
    resumeSession: resumeInspectionSession,
    pauseSession: pauseInspectionSession,
    addQuoteLine: addSessionQuoteLine,
    updateQuoteLine: updateSessionQuoteLine,
  } = useInspectionSession(initialSession);

  // Realtime finalization can arrive while this screen is open. Keep every
  // mutation entry point read-only as soon as the canonical row is locked.
  const updateInspection = (
    ...args: Parameters<typeof updateSessionInspection>
  ) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      updateSessionInspection(...args);
    }
  };
  const updateItem = (...args: Parameters<typeof updateSessionItem>) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      updateSessionItem(...args);
    }
  };
  const updateSection = (...args: Parameters<typeof updateSessionSection>) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      updateSessionSection(...args);
    }
  };
  const addQuoteLine = (...args: Parameters<typeof addSessionQuoteLine>) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      addSessionQuoteLine(...args);
    }
  };
  const updateQuoteLine = (
    ...args: Parameters<typeof updateSessionQuoteLine>
  ) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      updateSessionQuoteLine(...args);
    }
  };
  const resumeSession = (
    ...args: Parameters<typeof resumeInspectionSession>
  ) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      resumeInspectionSession(...args);
    }
  };
  const pauseSession = (
    ...args: Parameters<typeof pauseInspectionSession>
  ) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      pauseInspectionSession(...args);
    }
  };
  const finishSession = (
    ...args: Parameters<typeof finishInspectionSession>
  ) => {
    if (draftReadyRef.current && !isLockedRef.current) {
      finishInspectionSession(...args);
    }
  };

  const {
    hydrated: serverBootLoaded,
    flushToServer: flushAutosaveToServer,
    label: autosaveLabel,
    lastError: autosaveError,
  } = useInspectionAutosave({
    session,
    inspectionId,
    workOrderLineId,
    enabled: draftReady,
    locked: isLocked,
    draftKey,
    recoveryOperationKey,
    onRemoteSession: replaceSession,
    onRemoteMeta: (meta) => applyLockedState(meta.locked),
    onRecoveryState: (_state, operationKey) =>
      setRecoveryOperationKey(operationKey),
  });
  const inspectionReady = draftReady && serverBootLoaded;
  draftReadyRef.current = inspectionReady;

  // ---- AI submit guarding ----
  const inFlightRef = useRef<Set<string>>(new Set());
  const isSubmittingAI = (secIdx: number, itemIdx: number): boolean =>
    inFlightRef.current.has(`${secIdx}:${itemIdx}`);

  const submitAIForItem = async (
    secIdx: number,
    itemIdx: number,
  ): Promise<void> => {
    if (!draftReadyRef.current || !session || isLockedRef.current) return;
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

      if (isLockedRef.current) {
        toast.error("Inspection was signed while AI was running.", { id: tId });
        return;
      }

      if (!suggestion) {
        updateQuoteLine(id, { aiState: "error" });
        toast.error("No AI suggestion available", { id: tId });
        return;
      }

      const partsTotal =
        suggestion.parts?.reduce((sum, part) => sum + (part.cost || 0), 0) ?? 0;
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

      if (isLockedRef.current) {
        toast.error("Inspection was signed before work-order changes were sent.", {
          id: tId,
        });
        return;
      }

      if (workOrderId) {
        await addWorkOrderLineFromSuggestion({
          workOrderId,
          description: desc,
          section: session.sections[secIdx].title,
          status: "awaiting",
          suggestion,
          source: "inspection",
          jobType: "inspection",
        });
        toast.success("Added to work order (awaiting approval)", { id: tId });
      } else {
        toast.error("Missing work order id — saved locally only", { id: tId });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Submit AI failed:", e);
      toast.error("Couldn't add to work order");
    } finally {
      inFlightRef.current.delete(key);
    }
  };

  // ---- boot/restore ----
  useEffect(() => {
    let cancelled = false;
    setDraftBootLoaded(false);
    setLoadedDraftKey(null);
    setRecoveryOperationKey(undefined);
    applyLockedState(false);
    stopRecognition();

    void (async () => {
      let browserSession: InspectionSession | null = null;
      try {
        const saved = localStorage.getItem(draftKey);
        browserSession = saved
          ? (JSON.parse(saved) as InspectionSession)
          : null;
      } catch {
        browserSession = null;
      }

      const durableDraft = await getInspectionOfflineDraft({
        draftKey,
        sessionHint: browserSession ?? initialSession,
        newerSessionHint: browserSession,
      }).catch(() => null);

      const durableSession = durableDraft?.session ?? null;
      const durableAt = Date.parse(durableSession?.lastUpdated ?? "") || 0;
      const browserAt = Date.parse(browserSession?.lastUpdated ?? "") || 0;
      const restored =
        durableAt >= browserAt ? durableSession : browserSession;
      const restoredLineId = restored?.workOrderLineId?.trim() ?? "";
      const activeLineId = workOrderLineId?.trim() ?? "";
      const restoredMatchesIdentity =
        !restoredLineId || !activeLineId || restoredLineId === activeLineId;

      if (cancelled) return;
      if (restoredMatchesIdentity) {
        setRecoveryOperationKey(durableDraft?.operationKey);
      } else {
        setRecoveryOperationKey(undefined);
      }
      if (restored && restoredMatchesIdentity) replaceSession(restored);
      else startInspectionSession(initialSession);
      setLoadedDraftKey(draftKey);
      setDraftBootLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
    // draftKey is the canonical line identity for offline recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // Keep the lightweight browser copy under the same line-stable identity.
  useEffect(() => {
    if (draftReady && session) {
      localStorage.setItem(draftKey, JSON.stringify(session));
    }
  }, [draftKey, draftReady, session]);

  useEffect(() => {
    const persistNow = () => {
      if (!draftReady) return;
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify(session ?? initialSession),
        );
      } catch {
        // The durable IndexedDB draft remains authoritative.
      }
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
  }, [draftKey, draftReady, initialSession, session]);

  // build sections once
  useEffect(() => {
    if (!draftReady || !session) return;
    if ((session.sections?.length ?? 0) > 0) return;
    const next: InspectionSection[] = [
      buildHydraulicMeasurementsSection(),
      buildLightsSection(),
      buildBrakesSection(),
      buildSuspensionSection(),
      buildDrivelineSection(),
    ];
    updateInspection({
      sections: applyUnitsHydraulic(next, unit) as typeof session.sections,
    });
  }, [draftReady, session, updateInspection, unit]);

  // re-apply units
  useEffect(() => {
    if (!session?.sections?.length) return;
    updateInspection({
      sections: applyUnitsHydraulic(
        session.sections,
        unit,
      ) as typeof session.sections,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  // transcript → commands
  const handleTranscript = async (text: string): Promise<void> => {
    if (!draftReadyRef.current || isLockedRef.current) return;
    const commands: ParsedCommand[] = await interpretCommand(text);
    const sess: InspectionSession | undefined = session ?? undefined;
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

  // ✅ MUST be Promise-returning for StartListeningButton typing
  const startListening = async (): Promise<void> => {
    if (!draftReadyRef.current || isLockedRef.current) return;
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

  /* 🧹 embed-safe scrubber (remove full-screen / overflow locks) */
  useEffect(() => {
    if (!isEmbed) return;
    const root = rootRef.current;
    if (!root) return;

    const BAD = [
      "h-screen",
      "min-h-screen",
      "max-h-screen",
      "overflow-hidden",
      "fixed",
      "inset-0",
      "w-screen",
      "overscroll-contain",
      "touch-pan-y",
    ];

    const scrub = (el: HTMLElement) => {
      if (!el.className) return;
      const classes = el.className.split(" ");
      const filtered = classes.filter((c) => c && !BAD.includes(c));
      if (filtered.length !== classes.length) {
        el.className = filtered.join(" ");
      }
      if (el.style?.overflow === "hidden") {
        el.style.overflow = "visible";
      }
    };

    root.querySelectorAll<HTMLElement>("*").forEach(scrub);

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && m.target instanceof HTMLElement) {
          scrub(m.target);
        }
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) {
              scrub(n);
              n.querySelectorAll?.("*")?.forEach((child) => {
                if (child instanceof HTMLElement) scrub(child);
              });
            }
          });
        }
      }
    });

    obs.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => obs.disconnect();
  }, [isEmbed]);

  /* 🔐 focus trap while embedded (keep Tab inside) */
  useEffect(() => {
    if (!isEmbed) return;
    const root = rootRef.current;
    if (!root) return;

    const selector =
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(selector),
      ).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.tabIndex !== -1 &&
          el.getAttribute("aria-hidden") !== "true",
      );

      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!active || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    root.addEventListener("keydown", handleKeyDown);
    return () => root.removeEventListener("keydown", handleKeyDown);
  }, [isEmbed]);

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="p-4 text-sm text-[color:var(--theme-text-secondary)]">Loading inspection…</div>;
  }

  const isMeasurements = (t?: string): boolean =>
    (t || "").toLowerCase().includes("measurements");

  const shell = isEmbed
    ? "mx-auto max-w-[1100px] px-3 pb-8"
    : "max-w-5xl mx-auto px-3 md:px-6 pb-16";

  const cardBase =
    "rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] backdrop-blur-md shadow-card";
  const headerCard = `${cardBase} px-4 py-4 md:px-6 md:py-5 mb-6`;
  const sectionCard = `${cardBase} px-4 py-4 md:px-5 md:py-5 mb-6`;

  const sectionTitle =
    "text-lg md:text-xl font-semibold text-accent text-center tracking-wide";
  const hint =
    "mt-1 block text-center text-[11px] uppercase tracking-[0.12em] text-[color:var(--theme-text-muted)]";

  const Body = (
    <div ref={rootRef} className={shell + (isEmbed ? " inspection-embed" : "")}>
      {isEmbed && (
        <style jsx global>{`
          .inspection-embed,
          .inspection-embed * {
            overscroll-behavior: auto !important;
          }
        `}</style>
      )}

      {/* Header */}
      <div className={headerCard}>
        <div className="mb-2 text-center">
          <div className="text-xs font-blackops uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Inspection
          </div>
          <div className="mt-1 text-xl font-blackops text-[color:var(--theme-text-primary)]">
            {session?.templateitem || templateName || "Maintenance 50 (Air)"}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {isMobileView && (
          <StartListeningButton isListening={isListening} onStart={startListening} />
        )}

        {isMobileView && (
          <PauseResumeButton
  isPaused={isPaused}
  onPause={() => {
    setIsPaused(true);
    pauseSession();
     // voice.stop()
  }}
  onResume={() => {
    setIsPaused(false);
    resumeSession();
    void startListening(); // voice.start()
  }}
/>
        )}

        {/* Unit toggle on all views */}
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          onClick={(): void =>
            setUnit(unit === "metric" ? "imperial" : "metric")
          }
        >
          Unit: {unit === "metric" ? "Metric (mm / kPa)" : "Imperial (in / psi)"}
        </Button>
      </div>

      {/* Progress */}
      <div className="mb-6 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 backdrop-blur">
        <ProgressTracker
          currentItem={session.currentItemIndex}
          currentSection={session.currentSectionIndex}
          totalSections={session.sections.length}
          totalItems={
            session.sections[session.currentSectionIndex]?.items.length || 0
          }
        />
      </div>

      {/* Sections */}
      <InspectionFormCtx.Provider value={{ updateItem }}>
        {session.sections.map((section: InspectionSection, sectionIndex: number) => (
          <div key={`${section.title}-${sectionIndex}`} className={sectionCard}>
            <h2 className={sectionTitle}>{section.title}</h2>
            {isMeasurements(section.title) && (
              <span className={hint}>
                {unit === "metric" ? "Enter mm / kPa / N·m" : "Enter in / psi / ft·lb"}
              </span>
            )}

            <div className="mt-4">
              {isMeasurements(section.title) ? (
                <CornerGrid sectionIndex={sectionIndex} items={section.items} />
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
                    ): void => {
                      updateItem(secIdx, itemIdx, { status });
                    } }
                    onUpdateNote={(
                      secIdx: number,
                      itemIdx: number,
                      note: string
                    ): void => {
                      updateItem(secIdx, itemIdx, { notes: note });
                    } }
                    onUpload={(
                      photoUrl: string,
                      secIdx: number,
                      itemIdx: number
                    ): void => {
                      const prev = session.sections[secIdx].items[itemIdx].photoUrls ?? [];
                      updateItem(secIdx, itemIdx, {
                        photoUrls: [...prev, photoUrl],
                      });
                    } }
                    requireNoteForAI
                    onSubmitAI={(secIdx, itemIdx) => void submitAIForItem(secIdx, itemIdx)}
                    isSubmittingAI={isSubmittingAI} inspectionId={""}                />
              )}
            </div>
          </div>
        ))}
      </InspectionFormCtx.Provider>

      {/* Footer */}
      <div className="mt-8 flex flex-col gap-4 border-t border-[color:var(--theme-border-soft)] pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <FinishInspectionButton
            session={session}
            workOrderLineId={workOrderLineId ?? ""}
            disabled={isLocked || !inspectionReady}
            beforeNavigate={async () => {
              if (!draftReadyRef.current) {
                throw new Error("Wait for this inspection to finish loading.");
              }
              const saved = await flushAutosaveToServer();
              if (!saved) {
                throw new Error("Inspection changed before autosave completed.");
              }
              return saved;
            }}
          />
          <div className="text-xs text-[color:var(--theme-text-secondary)]">
            {autosaveLabel}
            {autosaveError && (
              <span className="ml-2 text-red-400">{autosaveError}</span>
            )}
          </div>
          {!workOrderLineId && (
            <div className="text-xs text-red-400">
              Missing <code>workOrderLineId</code> — autosave/finish will be blocked.
            </div>
          )}
        </div>

        <div className="text-xs text-[color:var(--theme-text-secondary)] md:text-right">
          <span className="font-semibold text-[color:var(--theme-text-primary)]">Legend:</span>{" "}
          P = Pass &nbsp;•&nbsp; F = Fail &nbsp;•&nbsp; NA = Not applicable
        </div>
      </div>
    </div>
  );

  if (isEmbed) return Body;

  return (
    <PageShell
      title={session?.templateitem || templateName || "Maintenance 50 (Air)"}
      description="Quick 50-point air brake inspection."
    >
      {Body}
    </PageShell>
  );
}
