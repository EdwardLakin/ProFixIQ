// features/inspections/app/maintenance50-hydraulic/page.tsx
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

import type {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
  InspectionSection,
  InspectionSession,
  SessionCustomer,
  SessionVehicle,
} from "@inspections/lib/inspection/types";

import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import SectionDisplay from "@inspections/lib/inspection/SectionDisplay";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";

/* -------------------------------------------------------------------------- */
/* Web Speech — minimal local typings (parity with Air page)                   */
/* -------------------------------------------------------------------------- */

type WebSpeechResultCell = { transcript: string };
type WebSpeechResultRow = { [index: number]: WebSpeechResultCell };
type WebSpeechResults = { [index: number]: WebSpeechResultRow };

type WebSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: { results: WebSpeechResults; length: number }) => void;
  onerror: (event: { error?: string }) => void;
};

type SRConstructor = new () => WebSpeechRecognition;

function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

/* -------------------------------------------------------------------------- */
/* Header adapters (strict types, string-only for header)                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Hydraulic section builders                                                  */
/* -------------------------------------------------------------------------- */

function buildHydraulicMeasurementsSection(): InspectionSection {
  return {
    title: "Measurements (Hydraulic)",
    items: [
      // Tire pressures
      { item: "LF Tire Pressure", unit: "psi", value: "" },
      { item: "RF Tire Pressure", unit: "psi", value: "" },
      { item: "LR Tire Pressure", unit: "psi", value: "" },
      { item: "RR Tire Pressure", unit: "psi", value: "" },

      // Tread
      { item: "LF Tire Tread", unit: "mm", value: "" },
      { item: "RF Tire Tread", unit: "mm", value: "" },
      { item: "LR Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "LR Tire Tread (Inner)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Inner)", unit: "mm", value: "" },

      // Brakes
      { item: "LF Brake Pad Thickness", unit: "mm", value: "" },
      { item: "RF Brake Pad Thickness", unit: "mm", value: "" },
      { item: "LR Brake Pad Thickness", unit: "mm", value: "" },
      { item: "RR Brake Pad Thickness", unit: "mm", value: "" },

      // Rotors
      { item: "LF Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "RF Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "LR Rotor Condition / Thickness", unit: "mm", value: "" },
      { item: "RR Rotor Condition / Thickness", unit: "mm", value: "" },

      // After road test
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

/* -------------------------------------------------------------------------- */
/* Units (hydraulic)                                                           */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function Maintenance50HydraulicPage(): JSX.Element {
  const searchParams = useSearchParams();

  // Stable id (parity with Air)
  const inspectionId = useMemo<string>(() => searchParams.get("inspectionId") || uuidv4(), [searchParams]);

  // UI state
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [, setTranscript] = useState<string>("");
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);

  const templateName: string = searchParams.get("template") || "Maintenance 50 (Hydraulic)";

  // Header data (string-only)
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

  // Initial session (parity with Air)
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
  } = useInspectionSession(initialSession);

  /* -------------------------- LocalStorage hydrate/persist -------------------------- */

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

  // extra-safe persistence on tab switch/close (parity with Air)
  useEffect(() => {
    const key = `inspection-${inspectionId}`;
    const persistNow = () => {
      try {
        const payload = session ?? initialSession;
        localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        /* no-op */
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
  }, [session, inspectionId, initialSession]);

  /* -------------------------- Sections scaffold + unit toggle ----------------------- */

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

  useEffect(() => {
    if (!session?.sections?.length) return;
    updateInspection({ sections: applyUnitsHydraulic(session.sections, unit) as typeof session.sections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  /* -------------------------- Voice -> commands ------------------------------------ */

  const handleTranscript = async (text: string): Promise<void> => {
    setTranscript(text);
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
    const SR = resolveSR();
    if (!SR) {
      console.error("SpeechRecognition API not supported");
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const lastIndex = (event as unknown as { results: WebSpeechResults }).results
        ? Object.keys(event.results).length - 1
        : 0;
      const transcript =
        (event.results as WebSpeechResults)[lastIndex]?.[0]?.transcript ?? "";
      if (transcript) void handleTranscript(transcript);
    };
    recognition.onerror = (event) =>
      console.error("Speech recognition error:", event.error ?? "unknown");
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  /* -------------------------- Render ----------------------------------------------- */

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="p-4 text-white">Loading inspection…</div>;
  }

  const isMeasurements = (t?: string): boolean =>
    (t || "").toLowerCase().includes("measurements");

  // ✅ memoize the context value to prevent input remounts while typing
  const formCtxValue = useMemo(() => ({ updateItem }), [updateItem]);

  return (
    <div className="px-4 pb-14">
      {/* Header */}
      <CustomerVehicleHeader
        templateName={templateName}
        customer={toHeaderCustomer(session.customer ?? null)}
        vehicle={toHeaderVehicle(session.vehicle ?? null)}
      />

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
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
            recognitionRef.current?.stop();
          }}
          onResume={(): void => {
            setIsPaused(false);
            resumeSession();
            startListening();
          }}
          recognitionInstance={recognitionRef.current as unknown as SpeechRecognition | null}
          setRecognitionRef={(instance: SpeechRecognition | null): void => {
            (recognitionRef as React.MutableRefObject<WebSpeechRecognition | null>).current =
              (instance as unknown as WebSpeechRecognition) ?? null;
          }}
        />
        <button
          onClick={(): void => setUnit(unit === "metric" ? "imperial" : "metric")}
          className="rounded bg-zinc-700 px-3 py-2 text-white hover:bg-zinc-600"
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

      {/* Sections */}
      <InspectionFormCtx.Provider value={formCtxValue}>
        {session.sections.map((section: InspectionSection, sectionIndex: number) => (
          <div
            key={`${section.title}-${sectionIndex}`}
            className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="mb-2 flex items-end justify-between">
              <h2 className="text-xl font-semibold text-orange-400">{section.title}</h2>
              {isMeasurements(section.title) && (
                <span className="text-xs text-zinc-400">
                  {unit === "metric" ? "Enter mm / kPa / N·m" : "Enter in / psi / ft·lb"}
                </span>
              )}
            </div>

            {isMeasurements(section.title) ? (
              <CornerGrid sectionIndex={sectionIndex} items={section.items} />
            ) : (
              <SectionDisplay
                title={section.title}
                section={section}
                sectionIndex={sectionIndex}
                showNotes={true}
                showPhotos={true}
                onUpdateStatus={(
                  secIdx: number,
                  itemIdx: number,
                  status: InspectionItemStatus
                ): void => {
                  updateItem(secIdx, itemIdx, { status });

                  // Add a quote line when a non-measurement item is FAIL/RECOMMEND
                  if (status === "fail" || status === "recommend") {
                    const it = session.sections[secIdx].items[itemIdx];
                    const desc = it.item ?? it.name ?? "Item";
                    addQuoteLine({
                      id: uuidv4(),
                      description: desc,
                      item: desc,
                      name: desc,
                      status,
                      notes: it.notes ?? "",
                      price: 0,
                      laborTime: 0.5,
                      laborRate: 0,
                      editable: true,
                      source: "inspection",
                      value: it.value ?? "",
                      photoUrls: it.photoUrls ?? [],
                    });
                  }
                }}
                onUpdateNote={(secIdx: number, itemIdx: number, note: string): void => {
                  updateItem(secIdx, itemIdx, { notes: note });
                }}
                onUpload={(photoUrl: string, secIdx: number, itemIdx: number): void => {
                  const prev = session.sections[secIdx].items[itemIdx].photoUrls ?? [];
                  updateItem(secIdx, itemIdx, { photoUrls: [...prev, photoUrl] });
                }}
              />
            )}
          </div>
        ))}
      </InspectionFormCtx.Provider>

      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
        <div className="text-xs text-zinc-400">P = PASS, F = FAIL, NA = Not Applicable</div>
      </div>
    </div>
  );
}