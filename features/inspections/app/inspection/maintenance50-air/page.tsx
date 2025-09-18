// features/inspections/app/maintenance50-air/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";

import PauseResumeButton from "@inspections/lib/inspection/PauseResume";
import PhotoUploadButton from "@inspections/lib/inspection/PhotoUploadButton";
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
  InspectionItem,
} from "@inspections/lib/inspection/types";

import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";

/* -------------------------------------------------------------------------- */
/*                                   Builders                                 */
/* -------------------------------------------------------------------------- */

function buildAirCornerMeasurementsSection(): InspectionSection {
  return {
    title: "Measurements (Air – Corner Checks)",
    items: [
      // Tire Pressures
      { item: "LF Tire Pressure", unit: "psi", value: "" },
      { item: "RF Tire Pressure", unit: "psi", value: "" },
      { item: "LR Tire Pressure", unit: "psi", value: "" },
      { item: "RR Tire Pressure", unit: "psi", value: "" },

      // Tread depth
      { item: "LF Tread Depth", unit: "mm", value: "" },
      { item: "RF Tread Depth", unit: "mm", value: "" },
      { item: "LR Tread Depth (Outer)", unit: "mm", value: "" },
      { item: "LR Tread Depth (Inner)", unit: "mm", value: "" },
      { item: "RR Tread Depth (Outer)", unit: "mm", value: "" },
      { item: "RR Tread Depth (Inner)", unit: "mm", value: "" },

      // Lining / Shoe thickness
      { item: "LF Lining/Shoe Thickness", unit: "mm", value: "" },
      { item: "RF Lining/Shoe Thickness", unit: "mm", value: "" },
      { item: "LR Lining/Shoe Thickness", unit: "mm", value: "" },
      { item: "RR Lining/Shoe Thickness", unit: "mm", value: "" },

      // Drum / Rotor condition or thickness
      { item: "LF Drum/Rotor Condition", unit: "mm", value: "" },
      { item: "RF Drum/Rotor Condition", unit: "mm", value: "" },
      { item: "LR Drum/Rotor Condition", unit: "mm", value: "" },
      { item: "RR Drum/Rotor Condition", unit: "mm", value: "" },

      // Push-rod stroke
      { item: "LF Push Rod Travel", unit: "mm", value: "" },
      { item: "RF Push Rod Travel", unit: "mm", value: "" },
      { item: "LR Push Rod Travel", unit: "mm", value: "" },
      { item: "RR Push Rod Travel", unit: "mm", value: "" },
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

// Minimal lube/oil/filters + engine-bay checks for CVIP-style basic service
function buildOilLubeFiltersSection(): InspectionSection {
  return {
    title: "Oil / Lube / Filters (Diesel or Gas – quick bay checks)",
    items: [
      { item: "Engine Oil Level / Condition" },
      { item: "Oil Filter (replaced?)" },
      { item: "Fuel Water Separator (drain if needed)" },
      { item: "DEF Level (if equipped)" },
      { item: "Coolant Level" },
      { item: "Power Steering Fluid Level" },
      { item: "Brake Fluid Level" },
      { item: "Windshield Washer Fluid Level" },
      { item: "Engine Air Filter Condition" },
      { item: "Battery/Batteries State & Connections" },
      // single section notes line
      { item: "Section Notes", value: "", unit: "", notes: "" },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*                                  Unit map                                  */
/* -------------------------------------------------------------------------- */

function unitForAir(label: string, mode: "metric" | "imperial") {
  const l = label.toLowerCase();
  if (l.includes("tread")) return mode === "metric" ? "mm" : "in";
  if (l.includes("lining") || l.includes("shoe")) return mode === "metric" ? "mm" : "in";
  if (l.includes("drum") || l.includes("rotor")) return mode === "metric" ? "mm" : "in";
  if (l.includes("push rod")) return mode === "metric" ? "mm" : "in";
  if (l.includes("pressure")) return mode === "imperial" ? "psi" : "kPa";
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";
  // Air system rows keep their specific units unless toggled below
  return "";
}

function applyUnitsAir(sections: InspectionSection[], mode: "metric" | "imperial") {
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
        if (label.includes("leak") && mode === "metric") return { ...it, unit: "kPa/min" };
        if (label.includes("leak") && mode === "imperial") return { ...it, unit: "psi/min" };
        if ((label.includes("gov") || label.includes("warning") || label.includes("compressor")) && mode === "metric")
          return { ...it, unit: "kPa" };
        if ((label.includes("gov") || label.includes("warning") || label.includes("compressor")) && mode === "imperial")
          return { ...it, unit: "psi" };
        if (label.includes("torque")) return { ...it, unit: mode === "metric" ? "N·m" : "ft·lb" };
        return it;
      });
      return { ...s, items };
    }

    return s;
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Page logic                                  */
/* -------------------------------------------------------------------------- */

type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

export default function Maintenance50AirPage() {
  const searchParams = useSearchParams();

  // Stable id for persistence
  const inspectionId = useMemo(() => searchParams.get("inspectionId") || uuidv4(), [searchParams]);

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName = searchParams.get("template") || "Maintenance 50 (Air Brake CVIP)";

  const customer = {
    first_name: searchParams.get("first_name") || "",
    last_name: searchParams.get("last_name") || "",
    phone: searchParams.get("phone") || "",
    email: searchParams.get("email") || "",
    address: searchParams.get("address") || "",
    city: searchParams.get("city") || "",
    province: searchParams.get("province") || "",
    postal_code: searchParams.get("postal_code") || "",
  };

  const vehicle = {
    year: searchParams.get("year") || "",
    make: searchParams.get("make") || "",
    model: searchParams.get("model") || "",
    vin: searchParams.get("vin") || "",
    license_plate: searchParams.get("license_plate") || "",
    mileage: searchParams.get("mileage") || "",
    color: searchParams.get("color") || "",
    unit_number: searchParams.get("unit_number") || "",
    odometer: searchParams.get("odometer") || "",
  };

  const initialSession = useMemo(
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
    [inspectionId, templateName],
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

  // Hydrate from localStorage or start fresh
  useEffect(() => {
    const key = `inspection-${inspectionId}`;
    const saved = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        updateInspection(parsed);
      } catch {
        startSession(initialSession);
      }
    } else {
      startSession(initialSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (session) {
      const key = `inspection-${inspectionId}`;
      localStorage.setItem(key, JSON.stringify(session));
    }
  }, [session, inspectionId]);

  // Scaffold sections once
  useEffect(() => {
    if (!session) return;
    if ((session.sections?.length ?? 0) > 0) return;

    const next: InspectionSection[] = [
      buildAirCornerMeasurementsSection(),
      buildAirSystemMeasurementsSection(),
      buildOilLubeFiltersSection(),
      buildLightsSection(),
      buildSuspensionSection(),
      buildDrivelineSection(),
    ];
    updateInspection({ sections: applyUnitsAir(next, unit) as typeof session.sections });
  }, [session, updateInspection]); // reapply unit below

  // Re-apply units on toggle
  useEffect(() => {
    if (!session?.sections?.length) return;
    updateInspection({ sections: applyUnitsAir(session.sections, unit) as typeof session.sections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  const handleTranscript = async (text: string) => {
    setTranscript(text);
    const commands: ParsedCommand[] = await interpretCommand(text);
    for (const cmd of commands) {
      await handleTranscriptFn({
        command: cmd,
        session,
        updateInspection,
        updateItem,
        updateSection,
        finishSession,
      });
    }
  };

  const startListening = () => {
    const SR = resolveSR();
    if (!SR) return console.error("SpeechRecognition API not supported");
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1;
      const t = event.results[last][0].transcript;
      handleTranscript(t);
    };
    recognition.onerror = (event: any) => console.error("Speech recognition error:", event.error);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="text-white p-4">Loading inspection…</div>;
  }

  const isMeasurements = (t?: string) => (t || "").toLowerCase().includes("measurements");
  const isOilLube = (t?: string) => (t || "").toLowerCase().includes("oil / lube / filters");

  return (
    <div className="px-4 pb-14">
      {/* Top: template + customer/vehicle */}
      <div className="mb-4 border-b border-zinc-800 pb-2">
        <h1 className="text-xl font-bold text-orange-400">{templateName}</h1>
        <div className="text-sm text-zinc-300">
          <span className="text-zinc-400">Customer:</span>{" "}
          {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"} ·{" "}
          <span className="text-zinc-400">Vehicle:</span>{" "}
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}{" "}
          {vehicle.license_plate ? `(${vehicle.license_plate})` : ""}
        </div>
      </div>

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
          onPause={() => {
            setIsPaused(true);
            pauseSession();
            recognitionRef.current?.stop();
          }}
          onResume={() => {
            setIsPaused(false);
            resumeSession();
            startListening();
          }}
          recognitionInstance={recognitionRef.current}
          setRecognitionRef={(instance) => (recognitionRef.current = instance)}
        />
        <button
          onClick={() => setUnit(unit === "metric" ? "imperial" : "metric")}
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
      <InspectionFormCtx.Provider value={{ updateItem }}>
        {session.sections.map((section: InspectionSection, sectionIndex: number) => (
          <div
            key={sectionIndex}
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
              <>
                {section.items.map((item: InspectionItem, itemIndex: number) => {
                  // The last row in the Oil/Lube section is the single notes box
                  const isOilNotes =
                    isOilLube(section.title) && (item.item ?? "").toLowerCase() === "section notes";

                  if (isOilNotes) {
                    return (
                      <div
                        key={itemIndex}
                        className="rounded border border-zinc-800 bg-zinc-950 p-3"
                      >
                        <div className="mb-1 text-xs font-medium text-orange-400">
                          {item.item}
                        </div>
                        <textarea
                          className="h-24 w-full resize-y rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                          value={String((item.notes ?? "") as string)}
                          onChange={(e) =>
                            updateItem(sectionIndex, itemIndex, { notes: e.target.value })
                          }
                          placeholder="Any recommendations or comments…"
                        />
                      </div>
                    );
                  }

                  const selected = (val: InspectionItemStatus) => item.status === val;
                  const onStatusClick = (val: InspectionItemStatus) => {
                    updateItem(sectionIndex, itemIndex, { status: val });
                    if ((val === "fail" || val === "recommend") && item.item) {
                      addQuoteLine({
                        item: item.item,
                        description: item.notes || "",
                        status: val,
                        value: item.value || "",
                        notes: item.notes || "",
                        laborTime: 0.5,
                        laborRate: 0,
                        parts: [],
                        totalCost: 0,
                        editable: true,
                        source: "inspection",
                        id: "",
                        name: "",
                        price: 0,
                        partName: "",
                      });
                    }
                  };

                  return (
                    <div
                      key={itemIndex}
                      className="mb-3 rounded border border-zinc-800 bg-zinc-950 p-3"
                    >
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <h3 className="min-w-0 truncate text-base font-medium text-white">
                          {item.item ?? "Item"}
                        </h3>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {(
                            ["ok", "fail", "na", "recommend"] as InspectionItemStatus[]
                          ).map((val) => (
                            <button
                              key={val}
                              onClick={() => onStatusClick(val)}
                              className={
                                "rounded px-2 py-1 text-xs " +
                                (selected(val)
                                  ? val === "ok"
                                    ? "bg-green-600 text-white"
                                    : val === "fail"
                                    ? "bg-red-600 text-white"
                                    : val === "na"
                                    ? "bg-yellow-500 text-white"
                                    : "bg-blue-500 text-white"
                                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")
                              }
                            >
                              {val.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <input
                          value={(item.value as string) ?? ""}
                          onChange={(e) =>
                            updateItem(sectionIndex, itemIndex, { value: e.target.value })
                          }
                          placeholder="Value"
                          className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                        />
                        <input
                          value={item.unit ?? ""}
                          onChange={(e) =>
                            updateItem(sectionIndex, itemIndex, { unit: e.target.value })
                          }
                          placeholder="Unit"
                          className="sm:w-28 w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                        />
                        <input
                          value={item.notes ?? ""}
                          onChange={(e) =>
                            updateItem(sectionIndex, itemIndex, { notes: e.target.value })
                          }
                          placeholder="Notes"
                          className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400 sm:col-span-1 col-span-1"
                        />
                      </div>

                      {(item.status === "fail" || item.status === "recommend") && (
                        <PhotoUploadButton
                          photoUrls={item.photoUrls || []}
                          onChange={(urls: string[]) => {
                            updateItem(sectionIndex, itemIndex, { photoUrls: urls });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        ))}
      </InspectionFormCtx.Provider>

      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
        <div className="text-xs text-zinc-400">
          P = PASS, F = FAIL, NA = Not Applicable
        </div>
      </div>
    </div>
  );
}