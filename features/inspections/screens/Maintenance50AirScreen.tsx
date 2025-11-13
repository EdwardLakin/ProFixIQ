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

import AirCornerGrid from "@inspections/lib/inspection/ui/AirCornerGrid";
import SectionDisplay from "@inspections/lib/inspection/SectionDisplay";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";

import { buildAirAxleItems } from "@inspections/lib/inspection/builders/addAxleHelpers";
import { startVoiceRecognition } from "@inspections/lib/inspection/voiceControl";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

/* ------------------------------ Header adapters ------------------------------ */
type HeaderCustomer = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  province: string;
  postal_code: string;
};

type HeaderVehicle = {
  year: string;
  make: string;
  model: string;
  vin: string;
  license_plate: string;
  mileage: string;
  color: string;
  unit_number: string;
  engine_hours: string;
};

function toHeaderCustomer(c?: SessionCustomer | null): HeaderCustomer {
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

function toHeaderVehicle(v?: SessionVehicle | null): HeaderVehicle {
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

/* ------------------------------ Section builders (AIR) ------------------------------ */
function buildAirCornerMeasurementsSection(): InspectionSection {
  return {
    title: "Measurements (Air – Corner Checks)",
    items: [
      { item: "Steer 1 Left Tire Pressure", unit: "psi", value: "" },
      { item: "Steer 1 Right Tire Pressure", unit: "psi", value: "" },

      { item: "Steer 1 Left Tread Depth", unit: "mm", value: "" },
      { item: "Steer 1 Right Tread Depth", unit: "mm", value: "" },

      { item: "Steer 1 Left Lining/Shoe Thickness", unit: "mm", value: "" },
      { item: "Steer 1 Right Lining/Shoe Thickness", unit: "mm", value: "" },

      { item: "Steer 1 Left Drum/Rotor Condition", unit: "", value: "" },
      { item: "Steer 1 Right Drum/Rotor Condition", unit: "", value: "" },

      { item: "Steer 1 Left Push Rod Travel", unit: "in", value: "" },
      { item: "Steer 1 Right Push Rod Travel", unit: "in", value: "" },
    ],
  };
}

function buildAirSystemMeasurementsSection(): InspectionSection {
  return {
    title: "Air System Measurements",
    items: [
      { item: "Air Build Time (90→120)", unit: "sec", value: "" },
      { item: "Gov Cut-In", unit: "psi", value: "" },
      { item: "Gov Cut-Out", unit: "psi", value: "" },
      { item: "Leak Rate @ Cut-Out", unit: "psi/min", value: "" },
      { item: "Low Air Warning Activates", unit: "psi", value: "" },
      { item: "Compressor Cut-Out Ref", unit: "psi", value: "" },
      { item: "Torque Reference", unit: "ft·lb", value: "" },
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

function buildSuspensionSection(): InspectionSection {
  return {
    title: "Suspension / Steering",
    items: [
      { item: "Front springs (coil/leaf)" },
      { item: "Rear springs (coil/leaf)" },
      { item: "Shocks / struts" },
      { item: "Control arms / ball joints" },
      { item: "Sway bar bushings / links" },
      { item: "Tie-rods / drag link / steering gear leaks" },
    ],
  };
}

function buildDrivelineSection(): InspectionSection {
  return {
    title: "Driveline / Axles",
    items: [
      { item: "Driveshaft / U-joints" },
      { item: "Center support bearing" },
      { item: "Slip yokes / seals" },
      { item: "Axle seals / leaks" },
      { item: "Differential leaks / play" },
    ],
  };
}

/* ------------------------------ Units helpers (AIR) ------------------------------ */
function unitForAir(label: string, mode: "metric" | "imperial"): string {
  const l = label.toLowerCase();
  if (l.includes("tire pressure")) return mode === "imperial" ? "psi" : "kPa";
  if (l.includes("tread")) return mode === "metric" ? "mm" : "in";
  if (l.includes("lining") || l.includes("shoe")) return mode === "metric" ? "mm" : "in";
  if (l.includes("drum") || l.includes("rotor")) return mode === "metric" ? "mm" : "in";
  if (l.includes("push rod")) return mode === "metric" ? "mm" : "in";
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";
  return "";
}

function applyUnitsAir(
  sections: InspectionSection[],
  mode: "metric" | "imperial"
): InspectionSection[] {
  return sections.map((s) => {
    const isCorner = (s.title || "").toLowerCase().includes("corner");
    const isAirMeas = (s.title || "").toLowerCase().includes("air system");

    if (isCorner) {
      const items = s.items.map((it) => ({
        ...it,
        unit: unitForAir(it.item ?? "", mode) || it.unit || "",
      }));
      return { ...s, items };
    }

    if (isAirMeas) {
      const items = s.items.map((it) => {
        const label = (it.item ?? "").toLowerCase();
        if (label.includes("build time")) return { ...it, unit: "sec" };
        if (label.includes("leak"))
          return { ...it, unit: mode === "metric" ? "kPa/min" : "psi/min" };
        if (label.includes("gov") || label.includes("warning") || label.includes("compressor"))
          return { ...it, unit: mode === "metric" ? "kPa" : "psi" };
        if (label.includes("torque")) return { ...it, unit: mode === "metric" ? "N·m" : "ft·lb" };
        return it;
      });
      return { ...s, items };
    }

    return s;
  });
}

/* ------------------------------ Page (Screen) ------------------------------ */
export default function Maintenance50AirPage(): JSX.Element {
  const searchParams = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isEmbed = useMemo(() => {
    const flag =
      ["1", "true", "yes"].includes(
        (searchParams.get("embed") || searchParams.get("compact") || "").toLowerCase()
      );
    const inIframe =
      typeof window !== "undefined" && window.self !== window.top;
    return flag || inIframe;
  }, [searchParams]);

  const workOrderLineId = searchParams.get("workOrderLineId") || null;
  const workOrderId = searchParams.get("workOrderId") || null;

  const inspectionId = useMemo<string>(
    () => searchParams.get("inspectionId") || uuidv4(),
    [searchParams]
  );

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName: string =
    searchParams.get("template") || "Maintenance 50 (Air Brake CVIP)";

  const customer: SessionCustomer = {
    first_name: searchParams.get("first_name") || "",
    last_name: searchParams.get("last_name") || "",
    phone: searchParams.get("phone") || "",
    email: searchParams.get("email") || "",
    address: searchParams.get("address") || "",
    city: searchParams.get("city") || "",
    province: searchParams.get("province") || "",
    postal_code: searchParams.get("postal_code") || "",
  };

  const vehicle: SessionVehicle = {
    year: searchParams.get("year") || "",
    make: searchParams.get("make") || "",
    model: searchParams.get("model") || "",
    vin: searchParams.get("vin") || "",
    license_plate: searchParams.get("license_plate") || "",
    mileage: searchParams.get("mileage") || "",
    color: searchParams.get("color") || "",
    unit_number: searchParams.get("unit_number") || "",
    engine_hours: searchParams.get("engine_hours") || "",
  };

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

  /* ---------- AI submit flow ---------- */
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
      // eslint-disable-next-line no-console
      console.error("Submit AI failed:", e);
      toast.error("Couldn't add to work order");
    } finally {
      inFlightRef.current.delete(key);
    }
  };

  /* ---------- hydrate / persist ---------- */
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

  useEffect(() => {
    if (session) {
      const key = `inspection-${inspectionId}`;
      localStorage.setItem(key, JSON.stringify(session));
    }
  }, [session, inspectionId]);

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

  /* ---------- sections + unit toggle ---------- */
  useEffect(() => {
    if (!session) return;
    if ((session.sections?.length ?? 0) > 0) return;

    const next: InspectionSection[] = [
      buildAirCornerMeasurementsSection(),
      buildAirSystemMeasurementsSection(),
      buildLightsSection(),
      buildSuspensionSection(),
      buildDrivelineSection(),
    ];
    updateInspection({
      sections: applyUnitsAir(next, unit) as typeof session.sections,
    });
  }, [session, updateInspection, unit]);

  useEffect(() => {
    if (!session?.sections?.length) return;
    updateInspection({
      sections: applyUnitsAir(session.sections, unit) as typeof session.sections,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  /* ---------- speech → commands ---------- */
  const handleTranscript = async (text: string): Promise<void> => {
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

  /* 🧹 embed-safe scrubber */
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

  /* 🔐 focus trap when embedded */
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
    return <div className="p-4 text-white">Loading inspection…</div>;
  }

  const isCorner = (t?: string): boolean =>
    (t || "").toLowerCase().includes("corner");

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

  const Body = (
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

      {/* Header */}
      <div className={headerCard}>
        <div className="mb-2 text-center">
          <div className="text-xs font-blackops uppercase tracking-[0.18em] text-neutral-400">
            Inspection
          </div>
          <div className="mt-1 text-xl font-blackops text-white">
            {session?.templateitem || templateName || "Maintenance 50 – Air Brake CVIP"}
          </div>
        </div>
        <CustomerVehicleHeader
          templateName=""
          customer={toHeaderCustomer(session.customer ?? null)}
          vehicle={toHeaderVehicle(session.vehicle ?? null)}
        />
      </div>

      {/* Controls */}
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

      {/* Sections */}
      <InspectionFormCtx.Provider value={{ updateItem }}>
        {session.sections.map((section: InspectionSection, sectionIndex: number) => (
          <div key={`${section.title}-${sectionIndex}`} className={sectionCard}>
            <h2 className={sectionTitle}>{section.title}</h2>
            {isCorner(section.title) && (
              <span className={hint}>
                {unit === "metric"
                  ? "Enter mm / kPa / N·m"
                  : "Enter in / psi / ft·lb"}
              </span>
            )}

            <div className="mt-4">
              {isCorner(section.title) ? (
                <AirCornerGrid
                  sectionIndex={sectionIndex}
                  items={section.items}
                  unitHint={(label: string) => unitForAir(label, unit)}
                  onAddAxle={(axleLabel: string) => {
                    const extra = buildAirAxleItems(axleLabel);
                    updateSection(sectionIndex, {
                      items: [...section.items, ...extra],
                    });
                  }}
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
                  ): void => {
                    updateItem(secIdx, itemIdx, { status });
                  }}
                  onUpdateNote={(
                    secIdx: number,
                    itemIdx: number,
                    note: string
                  ): void => {
                    updateItem(secIdx, itemIdx, { notes: note });
                  }}
                  onUpload={(
                    photoUrl: string,
                    secIdx: number,
                    itemIdx: number
                  ): void => {
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
        ))}
      </InspectionFormCtx.Provider>

      {/* Footer */}
      <div className="mt-8 flex flex-col gap-4 border-t border-white/5 pt-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <SaveInspectionButton
            session={session}
            workOrderLineId={workOrderLineId ?? ""}
          />
          <FinishInspectionButton
            session={session}
            workOrderLineId={workOrderLineId ?? ""}
          />
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

  if (isEmbed) return Body;

  return (
    <PageShell
      title={session?.templateitem || templateName || "Maintenance 50 – Air Brake CVIP"}
      description="Air-brake CVIP multi-axle inspection."
    >
      {Body}
    </PageShell>
  );
}