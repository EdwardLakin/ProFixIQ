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

import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";

/** Resolve the SR constructor without touching global typings */
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
/* CVIP-style helpers (Air Brake)                                      */
/* ------------------------------------------------------------------ */

function buildAirMeasurementSection(): InspectionSection {
  const items: InspectionItem[] = [
    // --- System Basics ---
    { item: "Compressor Build Time (85 → 100 PSI)", unit: "sec", value: "", notes: "" },
    { item: "Governor Cut-In Pressure", unit: "PSI", value: "", notes: "" },
    { item: "Governor Cut-Out Pressure", unit: "PSI", value: "", notes: "" },
    { item: "Reservoir Moisture / Oil Present", value: "", unit: "", notes: "" },

    // --- Static / Applied Leakage (tractor unit alone) ---
    { item: "Static Leakage (no brake applied, 1 min)", unit: "PSI/min", value: "", notes: "" },
    { item: "Applied Leakage (full service, 1 min)", unit: "PSI/min", value: "", notes: "" },

    // --- Warnings / Spring Application ---
    { item: "Low Air Warning Activation", unit: "PSI", value: "", notes: "" },
    { item: "Spring Brake Application (protection) Activation", unit: "PSI", value: "", notes: "" },

    // --- ABS / Dryer / Lines ---
    { item: "ABS Lamp Bulb Check (on → out)", value: "", unit: "", notes: "" },
    { item: "Air Dryer / Filter Condition", value: "", unit: "", notes: "" },
    { item: "Lines & Fittings – Leaks/Chafing", value: "", unit: "", notes: "" },
    { item: "Gladhands / Couplers / Seals (if equipped)", value: "", unit: "", notes: "" },

    // --- Push-Rod Stroke (service brakes) ---
    // Use measured stroke; you can compare to class max off-line if desired.
    { item: "FL Brake Chamber Push-Rod Stroke", unit: "in", value: "", notes: "" },
    { item: "FR Brake Chamber Push-Rod Stroke", unit: "in", value: "", notes: "" },
    { item: "RL Brake Chamber Push-Rod Stroke", unit: "in", value: "", notes: "" },
    { item: "RR Brake Chamber Push-Rod Stroke", unit: "in", value: "", notes: "" },

    // --- Linings / Drums ---
    { item: "FL Lining Remaining", unit: "mm", value: "", notes: "" },
    { item: "FR Lining Remaining", unit: "mm", value: "", notes: "" },
    { item: "RL Lining Remaining", unit: "mm", value: "", notes: "" },
    { item: "RR Lining Remaining", unit: "mm", value: "", notes: "" },
    { item: "FL Drum / Rotor Condition", unit: "", value: "", notes: "" },
    { item: "FR Drum / Rotor Condition", unit: "", value: "", notes: "" },
    { item: "RL Drum / Rotor Condition", unit: "", value: "", notes: "" },
    { item: "RR Drum / Rotor Condition", unit: "", value: "", notes: "" },

    // --- Tires / Wheel Torque (after road test) ---
    { item: "LF Tire Tread", unit: "mm", value: "", notes: "" },
    { item: "RF Tire Tread", unit: "mm", value: "", notes: "" },
    { item: "LR Tire Tread (Outer)", unit: "mm", value: "", notes: "" },
    { item: "LR Tire Tread (Inner)", unit: "mm", value: "", notes: "" },
    { item: "RR Tire Tread (Outer)", unit: "mm", value: "", notes: "" },
    { item: "RR Tire Tread (Inner)", unit: "mm", value: "", notes: "" },
    { item: "Wheel Torque (after road test)", unit: "ft·lb", value: "", notes: "" },
  ];

  return { title: "Measurements (Air Brake CVIP)", items };
}

function buildOilChangeChecklist(): InspectionSection {
  return {
    title: "Oil Change / Service",
    items: [
      { item: "Engine Oil Grade", value: "", unit: "", notes: "" },
      { item: "Oil Capacity Filled", value: "", unit: "L", notes: "" },
      { item: "Oil Filter Part #", value: "", unit: "", notes: "" },
      { item: "Oil Pan Plug Torque", value: "", unit: "ft·lb", notes: "" },
      { item: "Reset Maintenance Reminder", notes: "" },
      { item: "Check for Leaks (post run)", status: "ok", notes: "" },
      { item: "Top Off Other Fluids (coolant, washer, etc.)", notes: "" },
    ],
  };
}

/** Ensure our top CVIP Measurements section + Oil Change exist */
function ensureScaffold(sections: InspectionSection[] | undefined): InspectionSection[] {
  const list = Array.isArray(sections) ? [...sections] : [];

  const hasMeasurements = list.some((s) =>
    (s.title || "").toLowerCase().includes("measurement"),
  );
  const hasOilChange = list.some((s) =>
    (s.title || "").toLowerCase().includes("oil change"),
  );

  if (!hasMeasurements) list.unshift(buildAirMeasurementSection());
  if (!hasOilChange) list.push(buildOilChangeChecklist());

  return list;
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function Maintenance50AirInspectionPage() {
  const searchParams = useSearchParams();

  // Unit + voice state
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Header info
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

  // Initial session
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
    [templateName], // eslint-disable-line react-hooks/exhaustive-deps
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

  // kick off once
  useEffect(() => {
    startSession(initialSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // scaffold sections once session is there
  useEffect(() => {
    const next = ensureScaffold(session?.sections);
    const changed =
      (session?.sections?.length ?? 0) !== next.length ||
      (session?.sections?.[0]?.title || "") !== next[0]?.title;
    if (changed) {
      updateInspection({ sections: next });
    }
  }, [session?.sections, updateInspection]);

  // voice → commands
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

  // start SR
  const startListening = () => {
    const SR = resolveSR();
    if (!SR) {
      console.error("SpeechRecognition API not supported");
      return;
    }
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1;
      const t = event.results[last][0].transcript;
      handleTranscript(t);
    };
    recognition.onerror = (event: Event & { error: string }) => {
      console.error("Speech recognition error:", event.error);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="text-white p-4">Loading inspection…</div>;
  }

  // UI helpers
  const SectionHeader = ({ title, note }: { title: string; note?: string }) => (
    <div className="mb-2 flex items-end justify-between">
      <h2 className="text-xl font-semibold text-orange-400">{title}</h2>
      {note ? <span className="text-xs text-zinc-400">{note}</span> : null}
    </div>
  );

  function HeaderCard() {
    return (
      <div className="mb-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-white">
        <h1 className="mb-3 text-center text-2xl font-bold">{templateName}</h1>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Vehicle */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">Vehicle Information</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="opacity-70">VIN</label>
              <div className="truncate">{vehicle.vin || "—"}</div>

              <label className="opacity-70">Unit #</label>
              <div>{vehicle.unit_number || "—"}</div>

              <label className="opacity-70">Year</label>
              <div>{vehicle.year || "—"}</div>

              <label className="opacity-70">Make</label>
              <div>{vehicle.make || "—"}</div>

              <label className="opacity-70">Model</label>
              <div>{vehicle.model || "—"}</div>

              <label className="opacity-70">Odometer</label>
              <div>{vehicle.odometer || vehicle.mileage || "—"}</div>

              <label className="opacity-70">Plate</label>
              <div>{vehicle.license_plate || "—"}</div>

              <label className="opacity-70">Color</label>
              <div>{vehicle.color || "—"}</div>
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">Customer Information</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="opacity-70">Name</label>
              <div>
                {[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}
              </div>

              <label className="opacity-70">Phone</label>
              <div>{customer.phone || "—"}</div>

              <label className="opacity-70">Email</label>
              <div className="truncate">{customer.email || "—"}</div>

              <label className="opacity-70">Address</label>
              <div className="col-span-1 truncate">
                {[customer.address, customer.city, customer.province, customer.postal_code]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderMeasurementRow = (item: InspectionItem, idx: number, sectionIndex: number) => (
    <div key={idx} className="grid grid-cols-12 items-center gap-2">
      <div className="col-span-6 text-sm">{item.item}</div>
      <input
        className="col-span-3 rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
        value={(item.value as string | number | null) ?? ""}
        onChange={(e) => updateItem(sectionIndex, idx, { value: e.target.value })}
        placeholder="—"
      />
      <input
        className="col-span-3 rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
        value={item.unit ?? ""}
        onChange={(e) => updateItem(sectionIndex, idx, { unit: e.target.value })}
        placeholder={unit === "metric" ? "mm / PSI / sec" : "in / PSI / sec"}
      />
    </div>
  );

  return (
    <div className="px-4 pb-14">
      <HeaderCard />

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
      {session.sections.map((section: InspectionSection, sectionIndex: number) => {
        const isMeasurements = (section?.title || "").toLowerCase().includes("measurement");

        return (
          <div key={sectionIndex} className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <SectionHeader
              title={section.title}
              note={
                /measurement/i.test(section.title)
                  ? "Enter measured values (PSI / sec / mm / in) and notes as needed."
                  : undefined
              }
            />

            {isMeasurements ? (
              <div className="space-y-3 rounded border border-zinc-700 bg-zinc-900 p-3">
                {section.items.map((it, idx) => renderMeasurementRow(it, idx, sectionIndex))}
              </div>
            ) : (
              section.items.map((item: InspectionItem, itemIndex: number) => {
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
                  <div key={itemIndex} className="mb-3 rounded border border-zinc-800 bg-zinc-950 p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="min-w-0 truncate text-base font-medium text-white">
                        {item.item ?? (item as any).name ?? "Item"}
                      </h3>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {(["ok", "fail", "na", "recommend"] as InspectionItemStatus[]).map((val) => (
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

                    {/* Optional numeric value/unit/notes */}
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
                        onChange={(urls: string[]) => {
                          updateItem(sectionIndex, itemIndex, { photoUrls: urls });
                        }}
                      />
                    )}

                    {Array.isArray(item.recommend) && item.recommend.length > 0 ? (
                      <p className="mt-2 text-xs text-yellow-400">
                        <strong>Recommended:</strong> {item.recommend.join(", ")}
                      </p>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
        <div className="text-xs text-zinc-400">P = PASS, F = FAIL, NA = Not Applicable</div>
      </div>
    </div>
  );
}