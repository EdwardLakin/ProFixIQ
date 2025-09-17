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

import { generateAxleLayout } from "@inspections/lib/inspection/generateAxleLayout";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";

/* ------------------------------------------------------------------ */
/* Speech Recognition resolver                                         */
/* ------------------------------------------------------------------ */

type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

/* ------------------------------------------------------------------ */
/* Builders                                                           */
/* ------------------------------------------------------------------ */

/** Corner measurements section for AIR — mirrors hydraulic LF/RF/LR/RR layout */
function buildCornerMeasurementsAir(): InspectionSection {
  return {
    title: "Measurements (Air)",
    items: [
      // LF/RF/LR/RR TREAD
      { item: "LF Tire Tread", unit: "mm", value: "", notes: "" },
      { item: "RF Tire Tread", unit: "mm", value: "", notes: "" },
      { item: "LR Tire Tread (Outer)", unit: "mm", value: "", notes: "" },
      { item: "LR Tire Tread (Inner)", unit: "mm", value: "", notes: "" },
      { item: "RR Tire Tread (Outer)", unit: "mm", value: "", notes: "" },
      { item: "RR Tire Tread (Inner)", unit: "mm", value: "", notes: "" },

      // Lining/Shoe thickness per corner
      { item: "LF Brake Lining/Shoe", unit: "mm", value: "", notes: "" },
      { item: "RF Brake Lining/Shoe", unit: "mm", value: "", notes: "" },
      { item: "LR Brake Lining/Shoe", unit: "mm", value: "", notes: "" },
      { item: "RR Brake Lining/Shoe", unit: "mm", value: "", notes: "" },

      // Drum/Rotor condition (some fleets track condition text with thickness)
      { item: "LF Drum/Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },
      { item: "RF Drum/Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },
      { item: "LR Drum/Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },
      { item: "RR Drum/Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },

      // Post-test wheel torque (if applicable)
      { item: "Wheel Torque (after road test)", unit: "ft·lb", value: "", notes: "" },
    ],
  };
}

/** Air system top measurements akin to CVIP spec box */
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

/** Axles with air-brake specifics (push-rod travel, etc.) */
function buildAxlesSectionAir(vehicleType: "truck" | "bus" | "trailer"): InspectionSection {
  const axles = generateAxleLayout(vehicleType);
  const items: InspectionItem[] = [];

  for (const a of axles) {
    items.push(
      { item: `${a.axleLabel} Left Tread Depth`,  unit: "mm", value: "" },
      { item: `${a.axleLabel} Right Tread Depth`, unit: "mm", value: "" },
      { item: `${a.axleLabel} Left Tire Pressure`,  unit: "psi", value: "" },
      { item: `${a.axleLabel} Right Tire Pressure`, unit: "psi", value: "" },

      { item: `${a.axleLabel} Left Drum/Rotor`, value: "", unit: "" },
      { item: `${a.axleLabel} Right Drum/Rotor`, value: "", unit: "" },
      { item: `${a.axleLabel} Left Lining/Shoe`,  unit: "mm", value: "" },
      { item: `${a.axleLabel} Right Lining/Shoe`, unit: "mm", value: "" },

      // air specifics
      { item: `${a.axleLabel} Left Push Rod Travel`,  unit: "in", value: "" },
      { item: `${a.axleLabel} Right Push Rod Travel`, unit: "in", value: "" },

      { item: `${a.axleLabel} Wheel Torque Inner`, unit: "ft·lb", value: "" },
      { item: `${a.axleLabel} Wheel Torque Outer`, unit: "ft·lb", value: "" },
    );
  }

  return { title: "Axles (Air)", items };
}

/** Oil change / service block */
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

/** Switch units on Measurements/Axles/Air-System sections */
function applyUnitsForAir(
  sections: InspectionSection[],
  system: "metric" | "imperial"
): InspectionSection[] {
  const isMetric = system === "metric";
  const torqueUnit = isMetric ? "N·m" : "ft·lb";
  const lengthUnit = isMetric ? "mm" : "in";

  return sections.map((sec) => {
    if (!/measurements|axles|air system/i.test(sec.title)) return sec;

    const items = sec.items.map((it) => {
      const label = (it.item || "").toLowerCase();

      // Length-based
      if (/tread|lining|shoe|rotor|drum/.test(label)) {
        return { ...it, unit: lengthUnit };
      }
      // Push-rod travel
      if (/push\s*rod\s*travel/.test(label)) {
        return { ...it, unit: isMetric ? "mm" : "in" };
      }
      // Torque
      if (/torque/.test(label)) {
        return { ...it, unit: torqueUnit };
      }
      // Tire pressure always psi for heavy duty
      if (/tire pressure/.test(label)) {
        return { ...it, unit: "psi" };
      }
      return it;
    });

    return { ...sec, items };
  });
}

/* ------------------------------------------------------------------ */
/* Corner grid component (same UX as Hydraulic)                        */
/* ------------------------------------------------------------------ */

function CornerGrid({
  sectionIndex,
  items,
  updateItem,
}: {
  sectionIndex: number;
  items: InspectionItem[];
  updateItem: (sIdx: number, iIdx: number, patch: Partial<InspectionItem>) => void;
}) {
  const find = (label: string) => items.findIndex((i) => (i.item ?? i.name) === label);
  const Field = ({ label, placeholder }: { label: string; placeholder?: string }) => {
    const idx = find(label);
    const item = items[idx];
    return (
      <div className="space-y-1">
        <div className="text-xs text-zinc-400">{label}</div>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <input
            className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
            value={(item?.value as string) ?? ""}
            onChange={(e) => updateItem(sectionIndex, idx, { value: e.target.value })}
            placeholder={placeholder ?? "—"}
          />
          <input
            className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
            value={item?.unit ?? ""}
            onChange={(e) => updateItem(sectionIndex, idx, { unit: e.target.value })}
            placeholder="unit"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* LEFT FRONT */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Left Front</div>
        <div className="grid gap-3">
          <Field label="LF Tire Tread" placeholder="mm" />
          <Field label="LF Brake Lining/Shoe" placeholder="mm" />
          <Field label="LF Drum/Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* RIGHT FRONT */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Right Front</div>
        <div className="grid gap-3">
          <Field label="RF Tire Tread" placeholder="mm" />
          <Field label="RF Brake Lining/Shoe" placeholder="mm" />
          <Field label="RF Drum/Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* LEFT REAR */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Left Rear</div>
        <div className="grid gap-3">
          <Field label="LR Tire Tread (Outer)" placeholder="mm" />
          <Field label="LR Tire Tread (Inner)" placeholder="mm" />
          <Field label="LR Brake Lining/Shoe" placeholder="mm" />
          <Field label="LR Drum/Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* RIGHT REAR */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Right Rear</div>
        <div className="grid gap-3">
          <Field label="RR Tire Tread (Outer)" placeholder="mm" />
          <Field label="RR Tire Tread (Inner)" placeholder="mm" />
          <Field label="RR Brake Lining/Shoe" placeholder="mm" />
          <Field label="RR Drum/Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* Wheel torque across bottom */}
      <div className="md:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">After Road Test</div>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Wheel Torque (after road test)" placeholder="ft·lb" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

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

  // choose vehicle_type for axle layout; default “truck”
  const vehicleType = (searchParams.get("vehicle_type") as "truck" | "bus" | "trailer") || "truck";

  // ---- Seed all key sections up-front to avoid flicker
  const seededSections = useMemo<InspectionSection[]>(
    () => [
      buildCornerMeasurementsAir(),
      buildAirSystemMeasurementSection(),
      buildAxlesSectionAir(vehicleType),
      buildOilChangeSection(),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicleType]
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
      sections: applyUnitsForAir(seededSections, unitSystem),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateName, customer, vehicle, seededSections, unitSystem]
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

  // Unit switch → rewrite units on the fly
  useEffect(() => {
    if (!session?.sections?.length) return;
    updateInspection({ sections: applyUnitsForAir(session.sections, unitSystem) as typeof session.sections });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitSystem]);

  // Voice capture
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

  function HeaderCard() {
    return (
      <div className="mb-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-white">
        <h1 className="mb-3 text-center text-2xl font-bold">{templateName}</h1>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Vehicle */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">Vehicle Information</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="opacity-70">VIN</label><div className="truncate">{vehicle.vin || "—"}</div>
              <label className="opacity-70">Unit #</label><div>{vehicle.unit_number || "—"}</div>
              <label className="opacity-70">Year</label><div>{vehicle.year || "—"}</div>
              <label className="opacity-70">Make</label><div>{vehicle.make || "—"}</div>
              <label className="opacity-70">Model</label><div>{vehicle.model || "—"}</div>
              <label className="opacity-70">Odometer</label><div>{vehicle.odometer || vehicle.mileage || "—"}</div>
              <label className="opacity-70">Plate</label><div>{vehicle.license_plate || "—"}</div>
              <label className="opacity-70">Color</label><div>{vehicle.color || "—"}</div>
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">Customer Information</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="opacity-70">Name</label>
              <div>{[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}</div>
              <label className="opacity-70">Phone</label><div>{customer.phone || "—"}</div>
              <label className="opacity-70">Email</label><div className="truncate">{customer.email || "—"}</div>
              <label className="opacity-70">Address</label>
              <div className="col-span-1 truncate">
                {[customer.address, customer.city, customer.province, customer.postal_code].filter(Boolean).join(", ") || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const SectionHeader = ({ title, note }: { title: string; note?: string }) => (
    <div className="mb-2 flex items-end justify-between">
      <h2 className="text-xl font-semibold text-orange-400">{title}</h2>
      {note ? <span className="text-xs text-zinc-400">{note}</span> : null}
    </div>
  );

  const isCornerMeasurements = (t?: string) => (t || "").toLowerCase().includes("measurements");
  const unitNote = unitSystem === "metric" ? "Enter mm / N·m / psi" : "Enter in / ft·lb / psi";

  return (
    <div className="px-4 pb-14">
      <HeaderCard />

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
      {session.sections.map((section: InspectionSection, sectionIndex: number) => (
        <div key={sectionIndex} className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <SectionHeader
            title={section.title}
            note={/measurements|axles|air system/i.test(section.title) ? unitNote : undefined}
          />

          {isCornerMeasurements(section.title) ? (
            <CornerGrid sectionIndex={sectionIndex} items={section.items} updateItem={updateItem} />
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
      ))}

      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
        <div className="text-xs text-zinc-400">P = PASS, F = FAIL, NA = Not Applicable</div>
      </div>
    </div>
  );
}