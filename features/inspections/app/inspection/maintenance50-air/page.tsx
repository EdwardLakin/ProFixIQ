// features/inspections/app/maintenance50/page.tsx
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
import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import { buildAirAxleSection } from "@inspections/lib/inspection/builders/buildAirAxleSections";
import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";

/* -------------------------------- Types -------------------------------- */
type BrakeType = "air" | "hydraulic";

/* --------------------------- Section Builders --------------------------- */
/** AIR measurements */
function buildMeasurementsAir(): InspectionSection {
  return {
    title: "Measurements (Air)",
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

/** HYDRAULIC measurements + basic sections to match your Maintenance50(Hydraulic) */
function buildHydraulicMeasurementsSection(): InspectionSection {
  return {
    title: "Measurements (Hydraulic)",
    items: [
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
      { item: "Slip yokes / seals" },
      { item: "Axle seals / leaks" },
      { item: "Differential leaks / play" },
    ],
  };
}
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

/* --------------------------- Unit Application --------------------------- */
function applyUnitsAir(
  sections: InspectionSection[],
  system: "metric" | "imperial",
): InspectionSection[] {
  const len = system === "metric" ? "mm" : "in";
  const torque = system === "metric" ? "N·m" : "ft·lb";

  return sections.map((sec) => {
    const title = (sec.title || "").toLowerCase();

    // Measurements (Air): psi/sec remain; torque flips
    if (title.includes("measurements")) {
      const items = sec.items.map((it) => {
        const l = (it.item || "").toLowerCase();
        if (l.includes("torque")) return { ...it, unit: torque };
        return it;
      });
      return { ...sec, items };
    }

    // Axles (Air): set units by metric label
    if (title.includes("axles")) {
      const items = sec.items.map((it) => {
        const l = (it.item || "").toLowerCase();
        if (
          l.includes("tread") ||
          l.includes("lining") ||
          l.includes("shoe") ||
          l.includes("travel") ||
          l.includes("drum") ||
          l.includes("rotor")
        ) {
          return { ...it, unit: len };
        }
        if (l.includes("tire pressure")) return { ...it, unit: "psi" };
        if (l.includes("torque")) return { ...it, unit: torque };
        return it;
      });
      return { ...sec, items };
    }

    return sec;
  });
}

function applyUnitsHydraulic(
  sections: InspectionSection[],
  system: "metric" | "imperial",
): InspectionSection[] {
  const len = system === "metric" ? "mm" : "in";
  const torque = system === "metric" ? "N·m" : "ft·lb";

  return sections.map((sec) => {
    const title = (sec.title || "").toLowerCase();
    if (title.includes("measurements")) {
      const items = sec.items.map((it) => {
        const l = (it.item || "").toLowerCase();
        if (l.includes("tire tread")) return { ...it, unit: len };
        if (l.includes("pad thickness")) return { ...it, unit: len };
        if (l.includes("rotor")) return { ...it, unit: len };
        if (l.includes("torque")) return { ...it, unit: torque };
        return it;
      });
      return { ...sec, items };
    }
    return sec;
  });
}

/* -------------------------------- Page -------------------------------- */

type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

export default function Maintenance50Page() {
  const searchParams = useSearchParams();

  const [unitSystem, setUnitSystem] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");

  // Brake type from query or default
  const initialBrakeType: BrakeType =
    (searchParams.get("brakes") as BrakeType) || "air";
  const [brakeType, setBrakeType] = useState<BrakeType>(initialBrakeType);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName =
    brakeType === "air" ? "Maintenance 50 (Air)" : "Maintenance 50 (Hydraulic)";

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

  // axle labels state (supports up to 5) — for AIR
  const [axleLabels, setAxleLabels] = useState<string[]>([
    "Steer 1",
    "Drive 1",
    "Drive 2",
  ]);

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
      brakeType, // persist in session
      sections: [] as InspectionSection[],
    }),
    [templateName, brakeType]
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

  // Helpers
  const isAirAxles = (t?: string) => /axles.*air/i.test(t || "");
  const isMeasurements = (t?: string) => (t || "").toLowerCase().includes("measurements");
  const isHydraulicMeasurements = (t?: string) => (t || "").toLowerCase().includes("hydraulic");

  // Seed sections for current brakeType
  const seedForBrakeType = (bt: BrakeType) => {
    if (bt === "air") {
      const axlesSection = buildAirAxleSection({
        vehicleType,
        labels: axleLabels,
        maxAxles: 5,
      });
      const seeded: InspectionSection[] = [
        buildMeasurementsAir(),
        axlesSection,
        buildOilChangeSection(),
      ];
      updateInspection({
        brakeType: bt,
        sections: applyUnitsAir(seeded, unitSystem),
      });
    } else {
      const seeded: InspectionSection[] = [
        buildHydraulicMeasurementsSection(),
        buildLightsSection(),
        buildBrakesSection(),
        buildSuspensionSection(),
        buildDrivelineSection(),
        buildOilChangeSection(),
      ];
      updateInspection({
        brakeType: bt,
        sections: applyUnitsHydraulic(seeded, unitSystem),
      });
    }
  };

  // Start once
  useEffect(() => {
    startSession(initialSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed once after session becomes available
  useEffect(() => {
    if (!session) return;
    if ((session.sections?.length ?? 0) > 0) return;
    seedForBrakeType(brakeType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Re-apply units when toggled
  useEffect(() => {
    if (!session?.sections?.length) return;
    const next =
      (session.brakeType as BrakeType) === "air"
        ? applyUnitsAir(session.sections, unitSystem)
        : applyUnitsHydraulic(session.sections, unitSystem);
    updateInspection({ sections: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitSystem]);

  // Change brake type via UI
  const onBrakeTypeChange = (bt: BrakeType) => {
    setBrakeType(bt);
    seedForBrakeType(bt);
  };

  // Unit hint for AxlesCornerGrid (AIR)
  const unitHintAir = (label: string) => {
    const l = label.toLowerCase();
    if (
      l.includes("tread") ||
      l.includes("lining") ||
      l.includes("shoe") ||
      l.includes("travel") ||
      l.includes("rotor") ||
      l.includes("drum")
    ) {
      return unitSystem === "metric" ? "mm" : "in";
    }
    if (l.includes("tire pressure")) return "psi";
    if (l.includes("torque")) return unitSystem === "metric" ? "N·m" : "ft·lb";
    return "";
  };

  // Add axle (up to 5) — AIR only
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

    // Rebuild Axles (Air) in place using regex detection
    const rebuilt = buildAirAxleSection({ vehicleType, labels, maxAxles: 5 });
    const idx = session.sections.findIndex((s) => isAirAxles(s.title));
    const sections =
      idx >= 0 ? session.sections.map((s, i) => (i === idx ? rebuilt : s)) : [rebuilt, ...session.sections];

    updateInspection({
      sections: applyUnitsAir(sections, unitSystem),
    });
  };

  // Voice handling
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

        {/* Brake type selector */}
        <select
          value={(session.brakeType as BrakeType) ?? brakeType}
          onChange={(e) => onBrakeTypeChange((e.target.value as BrakeType) || "air")}
          className="rounded bg-zinc-700 px-2 py-2 text-white hover:bg-zinc-600"
          title="Brake type"
        >
          <option value="air">Air Brakes</option>
          <option value="hydraulic">Hydraulic Brakes</option>
        </select>

        {/* Unit toggle */}
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
          const title = section.title || "";
          const isAxlesAir = isAirAxles(title);
          const isMeas = isMeasurements(title);

          // Header note (varies by brake type)
          const note =
            (session.brakeType as BrakeType) === "air"
              ? (isMeas || isAxlesAir)
                ? unitSystem === "metric"
                  ? "Enter mm / N·m / psi"
                  : "Enter in / ft·lb / psi"
                : undefined
              : isMeas
              ? unitSystem === "metric"
                ? "Enter mm / N·m"
                : "Enter in / ft·lb"
              : undefined;

          return (
            <div key={sectionIndex} className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <SectionHeader
                title={title}
                note={note}
                right={
                  isAxlesAir && axleLabels.length < 5 && (session.brakeType as BrakeType) === "air" ? (
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

              {(session.brakeType as BrakeType) === "air" ? (
                isAxlesAir ? (
                  <AxlesCornerGrid sectionIndex={sectionIndex} items={section.items} unitHint={unitHintAir} />
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
                )
              ) : // HYDRAULIC
              isHydraulicMeasurements(title) ? (
                <CornerGrid sectionIndex={sectionIndex} items={section.items} />
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