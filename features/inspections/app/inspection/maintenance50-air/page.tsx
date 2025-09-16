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

type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

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

/** Switch units on Axles/Measurements sections */
function applyUnitsForAir(sections: InspectionSection[], system: "metric" | "imperial"): InspectionSection[] {
  const mm = system === "metric";
  const torqueUnit = mm ? "N·m" : "ft·lb";
  const lengthUnit = mm ? "mm" : "in";

  return sections.map((sec) => {
    if (!/axles|air system/i.test(sec.title)) return sec;
    const items = sec.items.map((it) => {
      const label = (it.item || "").toLowerCase();

      if (/tread|lining|shoe|rotor|drum|travel/.test(label)) {
        return { ...it, unit: /travel/.test(label) ? (mm ? "mm" : "in") : lengthUnit };
      }
      if (/torque/.test(label)) return { ...it, unit: torqueUnit };
      if (/tire pressure/.test(label)) return { ...it, unit: "psi" };
      // air system psi stays psi / sec, leave untouched
      return it;
    });
    return { ...sec, items };
  });
}

/* -------------------------------- Page -------------------------------- */

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateName]
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

  // Scaffold: Air Measurements + Axles(Air) + … + Oil Change
  useEffect(() => {
    if (!session) return;
    const titles = (session.sections ?? []).map((s) => (s.title || "").toLowerCase());
    const needAirMeas = !titles.some((t) => t.includes("air system measurements"));
    const needAxles = !titles.some((t) => t.includes("axles"));
    const needOil = !titles.some((t) => t.includes("oil change"));

    if (needAirMeas || needAxles || needOil) {
      const next: InspectionSection[] = [
        ...(needAirMeas ? [buildAirSystemMeasurementSection()] : []),
        ...(needAxles ? [buildAxlesSectionAir(vehicleType)] : []),
        ...(session.sections ?? []),
        ...(needOil ? [buildOilChangeSection()] : []),
      ];
      updateInspection({ sections: applyUnitsForAir(next, unitSystem) as typeof session.sections });
    }
  }, [session, updateInspection, unitSystem, vehicleType]);

  // Apply unit switch
  useEffect(() => {
    if (!session?.sections?.length) return;
    const next = applyUnitsForAir(session.sections, unitSystem);
    updateInspection({ sections: next as typeof session.sections });
  }, [unitSystem]); // eslint-disable-line react-hooks/exhaustive-deps

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
            note={
              /axles|air system/i.test(section.title)
                ? (unitSystem === "metric" ? "Enter mm / N·m / psi" : "Enter in / ft·lb / psi")
                : undefined
            }
          />

          {section.items.map((item: InspectionItem, itemIndex: number) => {
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
                            ? val === "ok" ? "bg-green-600 text-white"
                            : val === "fail" ? "bg-red-600 text-white"
                            : val === "na" ? "bg-yellow-500 text-white"
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
          })}
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