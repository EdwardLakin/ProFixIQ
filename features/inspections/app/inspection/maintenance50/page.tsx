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

import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";

/* ----------------------------- Section Builders ---------------------------- */

function buildHydraulicMeasurementsSection(): InspectionSection {
  // CVIP-inspired top block for **hydraulic** systems
  return {
    title: "Measurements (Hydraulic)",
    items: [
      // Tire tread depths
      { item: "LF Tire Tread", unit: "mm", value: "", notes: "" },
      { item: "RF Tire Tread", unit: "mm", value: "", notes: "" },
      { item: "LR Tire Tread (Outer)", unit: "mm", value: "", notes: "" },
      { item: "LR Tire Tread (Inner)", unit: "mm", value: "", notes: "" },
      { item: "RR Tire Tread (Outer)", unit: "mm", value: "", notes: "" },
      { item: "RR Tire Tread (Inner)", unit: "mm", value: "", notes: "" },

      // Brake pad thicknesses
      { item: "LF Brake Pad Thickness", unit: "mm", value: "", notes: "" },
      { item: "RF Brake Pad Thickness", unit: "mm", value: "", notes: "" },
      { item: "LR Brake Pad Thickness", unit: "mm", value: "", notes: "" },
      { item: "RR Brake Pad Thickness", unit: "mm", value: "", notes: "" },

      // Rotor condition/thickness
      { item: "LF Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },
      { item: "RF Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },
      { item: "LR Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },
      { item: "RR Rotor Condition / Thickness", unit: "mm", value: "", notes: "" },

      // After road test
      { item: "Wheel Torque (after road test)", unit: "ft·lb", value: "", notes: "" },
    ],
  };
}

/* -------------------------- Corner split (LF/RF/LR/RR) --------------------- */

function CornerGrid({
  sectionIndex,
  items,
  updateItem,
}: {
  sectionIndex: number;
  items: InspectionItem[];
  updateItem: (sIdx: number, iIdx: number, patch: Partial<InspectionItem>) => void;
}) {
  const find = (label: string) => items.findIndex(i => (i.item ?? i.name) === label);
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
          <Field label="LF Brake Pad Thickness" placeholder="mm" />
          <Field label="LF Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* RIGHT FRONT */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Right Front</div>
        <div className="grid gap-3">
          <Field label="RF Tire Tread" placeholder="mm" />
          <Field label="RF Brake Pad Thickness" placeholder="mm" />
          <Field label="RF Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* LEFT REAR */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Left Rear</div>
        <div className="grid gap-3">
          <Field label="LR Tire Tread (Outer)" placeholder="mm" />
          <Field label="LR Tire Tread (Inner)" placeholder="mm" />
          <Field label="LR Brake Pad Thickness" placeholder="mm" />
          <Field label="LR Rotor Condition / Thickness" placeholder="mm" />
        </div>
      </div>

      {/* RIGHT REAR */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
        <div className="mb-2 font-semibold text-orange-400">Right Rear</div>
        <div className="grid gap-3">
          <Field label="RR Tire Tread (Outer)" placeholder="mm" />
          <Field label="RR Tire Tread (Inner)" placeholder="mm" />
          <Field label="RR Brake Pad Thickness" placeholder="mm" />
          <Field label="RR Rotor Condition / Thickness" placeholder="mm" />
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

/* ------------------------------- Page ------------------------------------- */

export default function Maintenance50HydraulicPage() {
  const searchParams = useSearchParams();
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [, setTranscript] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName = searchParams.get("template") || "Maintenance 50 (Hydraulic)";

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

  useEffect(() => {
    startSession(initialSession);
  }, [initialSession, startSession]);

  // ensure our measurement section exists at top (idempotent)
  useEffect(() => {
    if (!session) return;
    const titles = (session.sections ?? []).map((s) => s.title?.toLowerCase() || "");
    const needsMeasurements = !titles.some((t) => t.includes("measurements"));

    if (needsMeasurements) {
      updateInspection({
        sections: [buildHydraulicMeasurementsSection(), ...(session.sections ?? [])],
      });
    }
  }, [session, updateInspection]);

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

  // Simple SR bootstrap (unchanged)
  function resolveSR(): (new () => SpeechRecognition) | undefined {
    if (typeof window === "undefined") return undefined;
    const w = window as any;
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
  }
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

  const isMeasurementsTitle = (t?: string) => (t || "").toLowerCase().includes("measurements");

  return (
    <div className="px-4 pb-14">
      {/* Top controls unchanged */}
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
      {session.sections.map((section: InspectionSection, sectionIndex: number) => (
        <div key={sectionIndex} className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-xl font-semibold text-orange-400">{section.title}</h2>
          </div>

          {isMeasurementsTitle(section.title) ? (
            <CornerGrid
              sectionIndex={sectionIndex}
              items={section.items}
              updateItem={updateItem}
            />
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
      ))}

      {/* Footer actions (unchanged) */}
      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
        <div className="text-xs text-zinc-400">P = PASS, F = FAIL, NA = Not Applicable</div>
      </div>
    </div>
  );
}