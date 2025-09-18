"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/* ----------------------------- Section Builders ---------------------------- */

function buildHydraulicMeasurementsSection(): InspectionSection {
  return {
    title: "Measurements (Hydraulic)",
    items: [
      // Tread
      { item: "LF Tire Tread", unit: "mm", value: "" },
      { item: "RF Tire Tread", unit: "mm", value: "" },
      { item: "LR Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "LR Tire Tread (Inner)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Outer)", unit: "mm", value: "" },
      { item: "RR Tire Tread (Inner)", unit: "mm", value: "" },

      // Brakes (hydraulic corners)
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

/** New: normal section, not a corner grid */
function buildAirSystemMeasurementsSection(): InspectionSection {
  return {
    title: "Air System Measurements",
    items: [
      { item: "Air Build Time (90→120 psi)", unit: "sec", value: "" },
      { item: "Air Leak Rate @ Gov Cut-Out", unit: "psi/min", value: "" },
      { item: "Low Air Warning Activates", unit: "psi", value: "" },
      { item: "Governor Cut-In", unit: "psi", value: "" },
      { item: "Governor Cut-Out", unit: "psi", value: "" },
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

/** Updated: includes air-brake components (pads/shoes, rotors/drums, push-rod travel) */
function buildBrakesSection(): InspectionSection {
  return {
    title: "Brakes",
    items: [
      // Hydraulic/common checks
      { item: "Front brake pads" },
      { item: "Rear brake pads" },
      { item: "Brake fluid level" },
      { item: "Brake lines and hoses" },
      { item: "ABS wiring / sensors" },
      { item: "Brake warning lights" },

      // Air-brake specific components (added to this section)
      { item: "Front rotors/drums condition" },
      { item: "Rear rotors/drums condition" },
      { item: "Front pads/shoes condition" },
      { item: "Rear pads/shoes condition" },

      // Push rod travel (units will be typed in; default implies in/mm)
      { item: "LF Push Rod Travel", unit: "in", value: "" },
      { item: "RF Push Rod Travel", unit: "in", value: "" },
      { item: "LR Push Rod Travel", unit: "in", value: "" },
      { item: "RR Push Rod Travel", unit: "in", value: "" },
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
      { item: "Slip yokes / seals" },
      { item: "Axle seals / leaks" },
      { item: "Differential leaks / play" },
    ],
  };
}

/* ---------------------- Unit helpers (hydraulic grid only) ------------------ */

function unitForHydraulic(label: string, mode: "metric" | "imperial") {
  const l = label.toLowerCase();
  if (l.includes("tire tread")) return mode === "metric" ? "mm" : "in";
  if (l.includes("pad thickness")) return mode === "metric" ? "mm" : "in";
  if (l.includes("rotor")) return mode === "metric" ? "mm" : "in";
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";
  return "";
}

function applyUnitsHydraulic(
  sections: InspectionSection[],
  mode: "metric" | "imperial",
) {
  return sections.map((s) => {
    const title = (s.title || "").toLowerCase();
    if (title === "measurements (hydraulic)") {
      const items = s.items.map((it) => ({
        ...it,
        unit: unitForHydraulic(it.item ?? "", mode) || it.unit || "",
      }));
      return { ...s, items };
    }
    if (title === "air system measurements") {
      const items = s.items.map((it) => {
        const l = (it.item || "").toLowerCase();
        if (l.includes("torque")) {
          return { ...it, unit: mode === "metric" ? "N·m" : "ft·lb" };
        }
        return it; // keep psi/sec as-is
      });
      return { ...s, items };
    }
    if (title === "brakes") {
      // Flip units for push-rod travel if user toggles units
      const items = s.items.map((it) => {
        const l = (it.item || "").toLowerCase();
        if (l.includes("push rod travel")) {
          return { ...it, unit: mode === "metric" ? "mm" : "in" };
        }
        return it;
      });
      return { ...s, items };
    }
    return s;
  });
}

/* -------------------------------- Page ------------------------------------- */

type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

export default function Maintenance50HydraulicPage() {
  const searchParams = useSearchParams();

  // Unit toggle
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");

  // Voice controls
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName =
    searchParams.get("template") || "Maintenance 50 (Hydraulic)";

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
      id: uuidv4(),
      templateitem: templateName,
      status: "not_started" as InspectionStatus,
      isPaused: false,
      isListening: false,
      transcript: "",
      quote: [],
      customer,
      vehicle,
      sections: [] as InspectionSection[],
    }),
    [templateName],
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

  // Start session once
  useEffect(() => {
    startSession(initialSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scaffold sections once
  useEffect(() => {
    if (!session) return;
    if ((session.sections?.length ?? 0) > 0) return;

    const next: InspectionSection[] = [
      buildHydraulicMeasurementsSection(),   // Corner grid (top)
      buildLightsSection(),
      buildBrakesSection(),                  // Now includes air-brake components
      buildSuspensionSection(),
      buildDrivelineSection(),
      buildAirSystemMeasurementsSection(),   // Normal section (not a corner grid)
    ];
    updateInspection({
      sections: applyUnitsHydraulic(next, unit) as InspectionSection[],
    });
  }, [session, updateInspection, unit]);

  // Re-apply units when toggled
  useEffect(() => {
    if (!session?.sections?.length) return;
    updateInspection({
      sections: applyUnitsHydraulic(session.sections, unit) as InspectionSection[],
    });
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
    recognition.onerror = (event: { error: string }) =>
      console.error("Speech recognition error:", event.error);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="text-white p-4">Loading inspection…</div>;
  }

  // Only corner the hydraulic measurements (keep Air System as normal section)
  const isHydraulicCorner = (t?: string) =>
    (t || "").toLowerCase() === "measurements (hydraulic)";

  return (
    <div className="px-4 pb-14">
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
        totalItems={
          session.sections[session.currentSectionIndex]?.items.length || 0
        }
      />

      {/* Sections */}
      <InspectionFormCtx.Provider value={{ updateItem }}>
        {session.sections.map((section: InspectionSection, sectionIndex: number) => (
          <div
            key={sectionIndex}
            className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="mb-2 flex items-end justify-between">
              <h2 className="text-xl font-semibold text-orange-400">
                {section.title}
              </h2>
              {isHydraulicCorner(section.title) && (
                <span className="text-xs text-zinc-400">
                  {unit === "metric" ? "Enter mm / N·m" : "Enter in / ft·lb"}
                </span>
              )}
            </div>

            {isHydraulicCorner(section.title) ? (
              <CornerGrid sectionIndex={sectionIndex} items={section.items} />
            ) : (
              section.items.map((item: InspectionItem, itemIndex: number) => {
                const selected = (val: InspectionItemStatus) =>
                  item.status === val;
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
                        {item.item}
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
                          updateItem(sectionIndex, itemIndex, {
                            value: e.target.value,
                          })
                        }
                        placeholder="Value"
                        className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                      />
                      <input
                        value={item.unit ?? ""}
                        onChange={(e) =>
                          updateItem(sectionIndex, itemIndex, {
                            unit: e.target.value,
                          })
                        }
                        placeholder="Unit"
                        className="sm:w-28 w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                      />
                      <input
                        value={item.notes ?? ""}
                        onChange={(e) =>
                          updateItem(sectionIndex, itemIndex, {
                            notes: e.target.value,
                          })
                        }
                        placeholder="Notes"
                        className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400 sm:col-span-1 col-span-1"
                      />
                    </div>

                    {(item.status === "fail" || item.status === "recommend") && (
                      <PhotoUploadButton
                        photoUrls={item.photoUrls || []}
                        onChange={(urls: string[]) => {
                          updateItem(sectionIndex, itemIndex, {
                            photoUrls: urls,
                          });
                        }}
                      />
                    )}
                  </div>
                );
              })
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