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

import AxlesCornerGrid from "@inspections/lib/inspection/ui/AxlesCornerGrid";
import { buildAirAxleSection } from "@inspections/lib/inspection/builders/buildAirAxleSections";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";

/* --------------------------- Builders (Air) --------------------------- */

function buildOilChangeSection(): InspectionSection {
  return {
    title: "Oil Change / Service",
    items: [
      { item: "Engine Oil Grade", value: "", unit: "", notes: "" },
      { item: "Oil Capacity Filled", value: "", unit: "L", notes: "" },
      { item: "Oil Filter Part #", value: "", unit: "", notes: "" },
      { item: "Drain Plug Torque", value: "", unit: "ft·lb", notes: "" },
      { item: "Reset Maintenance Reminder", notes: "" },
      { item: "Check for Leaks (post run)", status: "ok", notes: "" },
      { item: "Top Off Other Fluids (coolant, washer, etc.)", notes: "" },
    ],
  };
}

function buildAirSystemMeasurementSection(): InspectionSection {
  return {
    title: "Air System Measurements",
    items: [
      { item: "Air Build Time (90→120 psi)", unit: "sec", value: "" },
      { item: "Air Leak Rate @ Gov Cut-Out", unit: "psi/min", value: "" },
      { item: "Low Air Warning Activates", unit: "psi", value: "" },
      { item: "Governor Cut-In", unit: "psi", value: "" },
      { item: "Governor Cut-Out", unit: "psi", value: "" },
      { item: "Compressor Cut-Out Ref", unit: "psi", value: "" },
      { item: "Torque reference", unit: "ft·lb", value: "" },
    ],
  };
}

/* -------------------------------- Page -------------------------------- */

type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

export default function Maintenance50AirPage() {
  const searchParams = useSearchParams();

  const [unitSystem, setUnitSystem] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName = "Maintenance 50 (Air)";

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

  const vehicleType =
    (searchParams.get("vehicle_type") as "truck" | "bus" | "trailer") || "truck";

  // axle labels state (supports up to 5)
  const [axleLabels, setAxleLabels] = useState<string[]>(
    ["Steer 1", "Drive 1", "Drive 2"] // defaults for a tractor
  );

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
      sections: [],
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

  // Scaffold once: Air Measurements + Axles(Air) from labels + Oil Change
  useEffect(() => {
    if (!session) return;
    if ((session.sections?.length ?? 0) > 0) return;

    const axlesSection = buildAirAxleSection({
      vehicleType,
      labels: axleLabels,
      maxAxles: 5,
    });

    const next: InspectionSection[] = [
      buildAirSystemMeasurementSection(),
      axlesSection,
      buildOilChangeSection(),
    ];
    updateInspection({ sections: next as typeof session.sections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Unit hint for axle metrics
  const unitHint = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("tread") || l.includes("lining") || l.includes("shoe")) return unitSystem === "metric" ? "mm" : "in";
    if (l.includes("travel")) return unitSystem === "metric" ? "mm" : "in";
    if (l.includes("tire pressure")) return "psi";
    if (l.includes("torque")) return unitSystem === "metric" ? "N·m" : "ft·lb";
    if (l.includes("rotor") || l.includes("drum")) return unitSystem === "metric" ? "mm" : "in";
    return "";
  };

  // Add axle (up to 5). Order preference: Steer 2 → Drive 3 → Trailer 1 → Trailer 2 → Trailer 3
  const nextAxleLabel = (current: string[]): string | null => {
    const want: string[] = ["Steer 2", "Drive 3", "Trailer 1", "Trailer 2", "Trailer 3"];
    for (const cand of want) if (!current.includes(cand)) return cand;
    return null;
  };

  const addAxle = () => {
    if (!session?.sections?.length) return;
    if (axleLabels.length >= 5) return;

    const newLabel = nextAxleLabel(axleLabels);
    if (!newLabel) return;

    const labels = [...axleLabels, newLabel].slice(0, 5);
    setAxleLabels(labels);

    // Rebuild just the Axles (Air) section
    const rebuilt = buildAirAxleSection({ vehicleType, labels, maxAxles: 5 });

    const idx = session.sections.findIndex((s) => s.title === "Axles (Air)");
    const sections =
      idx >= 0
        ? session.sections.map((s, i) => (i === idx ? rebuilt : s))
        : [rebuilt, ...session.sections];

    updateInspection({ sections: sections as typeof session.sections });
  };

  // Voice
  const onTranscript = async (text: string) => {
    setTranscript(text);
    const cmds: ParsedCommand[] = await interpretCommand(text);
    for (const c of cmds) {
      await handleTranscriptFn({
        command: c,
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
    if (!SR) return console.error("SpeechRecognition not supported");
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const last = e.results.length - 1;
      onTranscript(e.results[last][0].transcript);
    };
    rec.onerror = (ev: Event & { error: string }) => console.error("Speech error:", ev.error);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  if (!session || !Array.isArray(session.sections) || session.sections.length === 0) {
    return <div className="text-white p-4">Loading inspection…</div>;
  }

  const SectionHeader = ({ title, note, right }: { title: string; note?: string; right?: React.ReactNode }) => (
    <div className="mb-2 flex items-end justify-between gap-2">
      <h2 className="text-xl font-semibold text-orange-400">{title}</h2>
      <div className="flex items-center gap-2">
        {note ? <span className="text-xs text-zinc-400">{note}</span> : null}
        {right}
      </div>
    </div>
  );

  return (
    <div className="px-4 pb-14">
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
        <StartListeningButton isListening={isListening} setIsListening={setIsListening} onStart={startListening} />

        <PauseResumeButton
          isPaused={isPaused}
          isListening={isListening}
          setIsListening={setIsListening}
          onPause={() => { setIsPaused(true); pauseSession(); recognitionRef.current?.stop(); }}
          onResume={() => { setIsPaused(false); resumeSession(); startListening(); }}
          recognitionInstance={recognitionRef.current}
          setRecognitionRef={(inst) => (recognitionRef.current = inst)}
        />

        <button
          onClick={() => setUnitSystem(unitSystem === "metric" ? "imperial" : "metric")}
          className="rounded bg-zinc-700 px-3 py-2 text-white hover:bg-zinc-600"
        >
          Unit: {unitSystem === "metric" ? "Metric" : "Imperial"}
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
        {session.sections.map((section: InspectionSection, sectionIndex: number) => {
          const isAxles = section.title === "Axles (Air)";
          const isAirSys = /air system/i.test(section.title);

          return (
            <div key={sectionIndex} className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <SectionHeader
                title={section.title}
                note={
                  isAxles || isAirSys
                    ? unitSystem === "metric"
                      ? "Enter mm / N·m / psi"
                      : "Enter in / ft·lb / psi"
                    : undefined
                }
                right={
                  isAxles && axleLabels.length < 5 ? (
                    <button
                      onClick={addAxle}
                      className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
                      title="Add another axle (up to 5)"
                    >
                      + Add Axle
                    </button>
                  ) : null
                }
              />

              {isAxles ? (
                <AxlesCornerGrid
                  sectionIndex={sectionIndex}
                  items={section.items}
                  /* updateItem comes from context */
                  unitHint={unitHint}
                />
              ) : (
                section.items.map((item: InspectionItem, itemIndex: number) => {
                  const selected = (v: InspectionItemStatus) => item.status === v;
                  const onStatus = (v: InspectionItemStatus) => {
                    updateItem(sectionIndex, itemIndex, { status: v });
                    if ((v === "fail" || v === "recommend") && item.item) {
                      addQuoteLine({
                        item: item.item,
                        description: item.notes || "",
                        status: v,
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
                    <div key={itemIndex} className="mb-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <h3 className="min-w-0 truncate text-base font-medium text-white">{item.item}</h3>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          {(["ok", "fail", "na", "recommend"] as InspectionItemStatus[]).map((val) => (
                            <button
                              key={val}
                              onClick={() => onStatus(val)}
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
                          onChange={(e) => updateItem(sectionIndex, itemIndex, { value: e.target.value })}
                          placeholder="Value"
                          className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                        />
                        <input
                          value={item.unit ?? ""}
                          onChange={(e) => updateItem(sectionIndex, itemIndex, { unit: e.target.value })}
                          placeholder="Unit"
                          className="sm:w-28 w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                        />
                        <input
                          value={item.notes ?? ""}
                          onChange={(e) => updateItem(sectionIndex, itemIndex, { notes: e.target.value })}
                          placeholder="Notes"
                          className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400 sm:col-span-1 col-span-1"
                        />
                      </div>

                      {(item.status === "fail" || item.status === "recommend") && (
                        <PhotoUploadButton
                          photoUrls={item.photoUrls || []}
                          onChange={(urls: string[]) => updateItem(sectionIndex, itemIndex, { photoUrls: urls })}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </InspectionFormCtx.Provider>

      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
        <div className="text-xs text-zinc-400">P = PASS, F = FAIL, NA = Not Applicable</div>
      </div>
    </div>
  );
}