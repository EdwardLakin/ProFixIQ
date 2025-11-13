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
import AxlesCornerGrid from "@inspections/lib/inspection/ui/AxlesCornerGrid";

import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

/* -------------------------- helpers -------------------------- */

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
  if (l.includes("pad") || l.includes("lining") || l.includes("shoe"))
    return mode === "metric" ? "mm" : "in";
  if (l.includes("rotor") || l.includes("drum")) return mode === "metric" ? "mm" : "in";
  if (l.includes("push rod")) return mode === "metric" ? "mm" : "in";
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";
  if (l.includes("leak rate")) return mode === "metric" ? "kPa/min" : "psi/min";
  if (l.includes("gov cut") || l.includes("warning")) return mode === "metric" ? "kPa" : "psi";
  return "";
}

/** Safe reader for sessionStorage JSON */
function readStaged<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Normalize + merge sections (copy name→item; merge same titles; dedupe items) */
function normalizeSections(input: unknown): InspectionSection[] {
  try {
    const arr = Array.isArray(input) ? input : [];
    const byTitle = new Map<string, InspectionSection>();

    for (const s of arr as any[]) {
      const title = String(s?.title ?? "").trim();
      if (!title) continue;

      const itemsRaw = Array.isArray(s?.items) ? s.items : [];
      const items = itemsRaw
        .map((it: any) => {
          const label = String(it?.item ?? it?.name ?? "").trim();
          if (!label) return null;
          return {
            ...it,
            item: label,
            unit: it?.unit ?? null,
          };
        })
        .filter(Boolean);

      if (!byTitle.has(title)) byTitle.set(title, { title, items: [] });
      const bucket = byTitle.get(title)!;
      const seen = new Set((bucket.items ?? []).map((x) => (x.item ?? "").toLowerCase()));
      for (const it of items as any[]) {
        const key = (it.item ?? "").toLowerCase();
        if (!seen.has(key)) {
          bucket.items = [...(bucket.items ?? []), it];
          seen.add(key);
        }
      }
    }

    return Array.from(byTitle.values()).filter((s) => (s.items?.length ?? 0) > 0);
  } catch {
    return [];
  }
}

/* -------- smarter corner-grid detector -------- */

const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const HYD_FULL_RE = /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

function shouldRenderCornerGrid(
  title: string | undefined,
  items: { item?: string | null }[] = []
): boolean {
  const t = (title || "").toLowerCase();

  if (
    t.includes("corner grid") ||
    t.includes("tires & brakes — truck") ||
    t.includes("tires & brakes — air") ||
    t.includes("axle grid")
  ) {
    return true;
  }

  if (!items || items.length < 4) return false;

  const hasStrongPattern = items.some((it) => {
    const label = it.item ?? "";
    return AIR_RE.test(label) || HYD_ABBR_RE.test(label) || HYD_FULL_RE.test(label);
  });

  const measurementKeywords = [
    "tread",
    "pressure",
    "lining",
    "shoe",
    "drum",
    "rotor",
    "push rod",
    "pad",
    "torque",
  ];
  const measurementLikeCount = items.reduce((count, it) => {
    const label = (it.item || "").toLowerCase();
    const isMeasurement = measurementKeywords.some((kw) => label.includes(kw));
    return count + (isMeasurement ? 1 : 0);
  }, 0);

  const enoughMeasurements = measurementLikeCount >= Math.floor(items.length / 2);

  const titleSuggestsMeasurement =
    t.includes("tire") ||
    t.includes("tires") ||
    t.includes("brake") ||
    t.includes("measurement") ||
    t.includes("axle");

  return hasStrongPattern || (titleSuggestsMeasurement && enoughMeasurements);
}

/* -------------------------------------------------------------------- */
/* Component                                                            */
/* -------------------------------------------------------------------- */

export default function GenericInspectionScreen(): JSX.Element {
  const sp = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Embed for iframe/modal
  const isEmbed = useMemo(
    () =>
      ["1", "true", "yes"].includes(
        (sp.get("embed") || sp.get("compact") || "").toLowerCase()
      ),
    [sp]
  );

  const workOrderId = sp.get("workOrderId") || null;
  const workOrderLineId = sp.get("workOrderLineId") || "";
  const templateName =
    (typeof window !== "undefined" ? sessionStorage.getItem("inspection:title") : null) ||
    (sp.get("template") || "Inspection");

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

  const bootSections = useMemo<InspectionSection[]>(() => {
    const staged = readStaged<InspectionSection[]>("inspection:sections");
    if (Array.isArray(staged) && staged.length) return normalizeSections(staged);

    try {
      const legacy =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:sections")
          : null;
      if (legacy) {
        const parsed = JSON.parse(legacy) as InspectionSection[];
        const norm = normalizeSections(parsed);
        return norm;
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

  // 🔸 try to hydrate from localStorage
  const persistedSession = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(`inspection-${inspectionId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as InspectionSession;
    } catch {
      return null;
    }
  }, [inspectionId]);

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // 🔴 wake-word state
  const [wakeActive, setWakeActive] = useState(false);
  const wakeTimeoutRef = useRef<number | null>(null);

  // openai realtime refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

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
  } = useInspectionSession(persistedSession ?? initialSession);

  // start
  useEffect(() => {
    if (persistedSession) {
      startSession(persistedSession);
    } else {
      startSession(initialSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedSession]);
  useEffect(() => {
    if (session && (session.sections?.length ?? 0) === 0) {
      updateInspection({ sections: bootSections });
    }
  }, [session, bootSections, updateInspection]);

  // persist
  useEffect(() => {
    if (!session) return;
    const key = `inspection-${inspectionId}`;
    localStorage.setItem(key, JSON.stringify(session));
  }, [session, inspectionId]);

  // persist on unload
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

  // 🔸 turn final text into inspection commands
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

  // 🔔 wake-word helper
  function maybeHandleWakeWord(raw: string): string | null {
    const lower = raw.toLowerCase().trim();
    const WAKE_WORDS = ["hey techy", "hey techie", "hey teki", "hey tekky"];

    if (!wakeActive) {
      const hit = WAKE_WORDS.find((w) => lower.startsWith(w));
      if (hit) {
        setWakeActive(true);
        if (wakeTimeoutRef.current) window.clearTimeout(wakeTimeoutRef.current);
        wakeTimeoutRef.current = window.setTimeout(() => {
          setWakeActive(false);
        }, 8000);
        return lower.slice(hit.length).trim();
      }
      return null;
    }

    if (wakeTimeoutRef.current) window.clearTimeout(wakeTimeoutRef.current);
    wakeTimeoutRef.current = window.setTimeout(() => {
      setWakeActive(false);
    }, 8000);

    return raw;
  }

  // 🔊 openai realtime start
  const startListening = async (): Promise<void> => {
    if (isListening) return;
    try {
      const res = await fetch("/api/openai/realtime-token");
      const { apiKey } = (await res.json()) as { apiKey: string };
      if (!apiKey) throw new Error("Missing OpenAI key");

      const ws = new WebSocket("wss://api.openai.com/v1/realtime?intent=transcription");
      wsRef.current = ws;

      ws.onopen = async () => {
        ws.send(
          JSON.stringify({
            type: "authorization",
            authorization: `Bearer ${apiKey}`,
          })
        );

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRef.current = stream;

        const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
        mediaRecorderRef.current = mr;
        mr.ondataavailable = (evt) => {
          if (evt.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(evt.data);
          }
        };
        mr.start(250);

        setIsListening(true);
      };

      ws.onmessage = async (evt) => {
        if (typeof evt.data !== "string") return;
        try {
          const msg = JSON.parse(evt.data);
          const text: string =
            msg.text || msg.transcript || msg.output || msg.content || "";
          if (!text) return;

          const maybeText = maybeHandleWakeWord(text);
          if (!maybeText) return;

          const lower = maybeText.toLowerCase();
          if (lower === "stop listening" || lower === "go to sleep") {
            setWakeActive(false);
            return;
          }

          await handleTranscript(maybeText);
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = (err) => {
        console.error("realtime ws error", err);
        toast.error("Voice connection error");
        stopListening();
      };

      ws.onclose = () => {
        stopListening();
      };
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Unable to start voice");
      stopListening();
    }
  };

  const stopListening = (): void => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;

    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setIsListening(false);
    setWakeActive(false);
    if (wakeTimeoutRef.current) {
      window.clearTimeout(wakeTimeoutRef.current);
      wakeTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // AI submit flow
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

  // 🧹 embed-safe scrubber (for iframe / modal host)
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
                if (child instanceof HTMLElement) scrub(child as HTMLElement);
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

  // 🔐 Focus trap so Tab stays inside the inspection when embedded in modal
  useEffect(() => {
    if (!isEmbed) return;
    const root = rootRef.current;
    if (!root) return;

    const selector =
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(selector)
      ).filter(
        (el) =>
          !el.hasAttribute("disabled") &&
          el.tabIndex !== -1 &&
          el.getAttribute("aria-hidden") !== "true"
      );

      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      // If focus is already outside the root, jump to first
      if (!active || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey) {
        // Shift+Tab: if we're on first, loop to last
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab forward: if we're on last, loop to first
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
    return (
      <div className="p-4 text-sm text-neutral-300">
        Loading inspection…
      </div>
    );
  }

  const shell = isEmbed
    ? "mx-auto max-w-[1100px] px-3 pb-8"
    : "max-w-5xl mx-auto px-3 md:px-6 pb-16";

  const cardBase =
    "rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md shadow-card";
  const headerCard = `${cardBase} px-4 py-4 md:px-6 md:py-5 mb-6`;
  const sectionCard = `${cardBase} px-4 py-4 md:px-5 md:py-5 mb-6`;

  const sectionTitle =
    "text-lg md:text-xl font-semibold text-accent text-center tracking-wide";
  const hint =
    "mt-1 block text-center text-[11px] uppercase tracking-[0.12em] text-neutral-500";

  const body = (
    <div
      ref={rootRef}
      className={shell + (isEmbed ? " inspection-embed" : "")}
    >
      {isEmbed && (
        <style jsx global>{`
          .inspection-embed,
          .inspection-embed * {
            overscroll-behavior: auto !important;
          }
        `}</style>
      )}

      {/* Header card */}
      <div className={headerCard}>
        <div className="mb-2 text-center">
          <div className="text-xs font-blackops uppercase tracking-[0.18em] text-neutral-400">
            Inspection
          </div>
          <div className="mt-1 text-xl font-blackops text-white">
            {session?.templateitem || templateName || "Inspection"}
          </div>
        </div>

        <CustomerVehicleHeader
          templateName=""
          customer={toHeaderCustomer(session.customer ?? null)}
          vehicle={toHeaderVehicle(session.vehicle ?? null)}
        />
      </div>

      {/* Controls row */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
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
            stopListening();
          }}
          onResume={(): void => {
            setIsPaused(false);
            resumeSession();
            void startListening();
          }}
          recognitionInstance={null}
          onTranscript={handleTranscript}
          setRecognitionRef={(): void => {
            /* noop – using OpenAI now */
          }}
        />
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
      <div className="mb-6 rounded-2xl border border-white/5 bg-black/20 px-4 py-3 backdrop-blur">
        <ProgressTracker
          currentItem={session.currentItemIndex}
          currentSection={session.currentSectionIndex}
          totalSections={session.sections.length}
          totalItems={
            session.sections[session.currentSectionIndex]?.items.length || 0
          }
        />
      </div>

      <InspectionFormCtx.Provider value={{ updateItem }}>
        {session.sections.map((section: InspectionSection, sectionIndex: number) => {
          const itemsWithHints = section.items.map((it) => ({
            ...it,
            unit: it.unit || unitHintGeneric(it.item ?? "", unit),
          }));

          const useGrid = shouldRenderCornerGrid(section.title, itemsWithHints);

          return (
            <div key={`${section.title}-${sectionIndex}`} className={sectionCard}>
              <h2 className={sectionTitle}>{section.title}</h2>
              {useGrid && (
                <span className={hint}>
                  {unit === "metric"
                    ? "Enter mm / kPa / N·m"
                    : "Enter in / psi / ft·lb"}
                </span>
              )}

              <div className="mt-4">
                {useGrid ? (
                  <AxlesCornerGrid
                    sectionIndex={sectionIndex}
                    items={itemsWithHints}
                  />
                ) : (
                  <SectionDisplay
                    title=""
                    section={{ ...section, items: itemsWithHints }}
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

      {/* Footer actions */}
      <div className="mt-8 flex flex-col gap-4 border-t border-white/5 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SaveInspectionButton session={session} workOrderLineId={workOrderLineId} />
          <FinishInspectionButton session={session} workOrderLineId={workOrderLineId} />
          {!workOrderLineId && (
            <div className="text-xs text-red-400">
              Missing <code>workOrderLineId</code> — save/finish will be blocked.
            </div>
          )}
        </div>

        <div className="text-xs text-neutral-400 md:text-right">
          <span className="font-semibold text-neutral-200">Legend:</span>{" "}
          P = Pass &nbsp;•&nbsp; F = Fail &nbsp;•&nbsp; NA = Not applicable
        </div>
      </div>
    </div>
  );

  if (isEmbed) return body;

  return (
    <PageShell
      title={session?.templateitem || templateName || "Inspection"}
      description="Run guided inspections, capture notes, and push items into work orders."
    >
      {body}
    </PageShell>
  );
}