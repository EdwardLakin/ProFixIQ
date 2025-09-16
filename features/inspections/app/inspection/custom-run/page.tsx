"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import PauseResumeButton from "@inspections/lib/inspection/PauseResume";
import PhotoUploadButton from "@inspections/lib/inspection/PhotoUploadButton";
import StartListeningButton from "@inspections/lib/inspection/StartListeningButton";
import ProgressTracker from "@inspections/lib/inspection/ProgressTracker";
import useInspectionSession from "@inspections/hooks/useInspectionSession";

import { handleTranscriptFn } from "@inspections/lib/inspection/handleTranscript";
import { interpretCommand } from "@inspections/components/inspection/interpretCommand";

import {
  type ParsedCommand,
  type InspectionItemStatus,
  type InspectionStatus,
  type InspectionSection,
  type InspectionItem,
} from "@inspections/lib/inspection/types";

import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";

import { generateAxleLayout } from "@inspections/lib/inspection/generateAxleLayout";
import { axlesToSections } from "@inspections/lib/inspection/axleAdapters";

/** SpeechRecognition constructor without touching global typings */
type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

type DB = Database;

export default function CustomRunPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  // Units + vehicle type selection
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [vehicleType, setVehicleType] = useState<"car" | "truck" | "bus" | "trailer">(
    (searchParams.get("vehicleType") as any) || "truck",
  );

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Header info
  const templateName = searchParams.get("template") || "Custom Inspection (Axle Layout)";

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

  // Initial session (empty sections; we inject axles next)
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

  // Start session once
  useEffect(() => {
    startSession(initialSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Build axle sections for the current vehicle type */
  const buildAxleSections = (type: "car" | "truck" | "bus" | "trailer"): InspectionSection[] => {
    const axles = generateAxleLayout(type);
    return axlesToSections(axles);
  };

  /** Replace any existing axle sections with freshly generated ones */
  const injectAxleSections = (type: "car" | "truck" | "bus" | "trailer") => {
    if (!session) return;
    const axleSections = buildAxleSections(type);

    // Treat anything titled exactly like the generated axle titles as axle sections
    const axleTitles = new Set(axleSections.map((s) => s.title));
    const nonAxle = (session.sections ?? []).filter((s) => !axleTitles.has(s.title));
    const merged = [...axleSections, ...nonAxle];

    updateInspection({ sections: merged });
  };

  // Inject axles when session is ready (initial) and whenever vehicleType changes
  useEffect(() => {
    if (!session) return;
    injectAxleSections(vehicleType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, vehicleType]);

  // Voice → commands
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

  // Start SR
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
    return <div className="p-4 text-white">Loading inspection…</div>;
  }

  /* ------------------------------- UI helpers ------------------------------ */

  const defaultUnitFor = (label: string): string => {
    const l = label.toLowerCase();
    if (/pressure|psi/.test(l)) return "psi";
    if (/tread|lining|pad|mm/.test(l)) return "mm";
    if (/push\s*rod/.test(l)) return unit === "metric" ? "mm" : "in";
    if (/torque/.test(l)) return "ft·lb";
    return unit === "metric" ? "" : "";
  };

  const unitHint = (item: InspectionItem) => {
    if (item.unit && item.unit.length) return item.unit;
    return defaultUnitFor(item.item ?? item.name ?? "");
  };

  /* ------------------------------- Header ---------------------------------- */

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

  /* ------------------------- Save as Template action ----------------------- */

  async function handleSaveAsTemplate() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        alert("Please sign in to save templates.");
        return;
      }

      const defaultName = `${templateName} — ${new Date().toLocaleDateString()}`;
      const templateNameInput =
        window.prompt("Template name:", defaultName)?.trim() || defaultName;

      const description =
        window.prompt("Optional description (or leave blank):", "")?.trim() || null;

      const payload: DB["public"]["Tables"]["inspection_templates"]["Insert"] = {
        user_id: userId,
        template_name: templateNameInput,
        sections: session.sections as any, // stored JSON
        description,
        tags: ["custom", vehicleType],
        vehicle_type: vehicleType,
        is_public: false,
      };

      const { error } = await supabase.from("inspection_templates").insert(payload);
      if (error) throw error;

      alert("Saved! Find it under Templates.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message ?? "Failed to save template.");
    }
  }

  /* -------------------------------- Render --------------------------------- */

  return (
    <div className="px-4 pb-14">
      <HeaderCard />

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

        <select
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value as any)}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
          title="Vehicle Type (regenerates axle sections)"
        >
          <option value="car">Car (Hydraulic)</option>
          <option value="truck">Truck (Air)</option>
          <option value="bus">Bus (Air)</option>
          <option value="trailer">Trailer (Air)</option>
        </select>

        <button
          onClick={handleSaveAsTemplate}
          className="rounded bg-orange-600 px-3 py-2 font-semibold text-white hover:bg-orange-500"
          title="Save current sections as a reusable template"
        >
          Save as Template
        </button>

        <Link
          href="/inspection/templates"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-white hover:bg-zinc-800"
        >
          View Templates
        </Link>
      </div>

      <ProgressTracker
        currentItem={session.currentItemIndex}
        currentSection={session.currentSectionIndex}
        totalSections={session.sections.length}
        totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
      />

      {/* Sections */}
      {session.sections.map((section: InspectionSection, sectionIndex: number) => (
        <div
          key={sectionIndex}
          className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
        >
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-xl font-semibold text-orange-400">{section.title}</h2>
            <span className="text-xs text-zinc-400">Enter mm / in / psi / ft·lb as applicable.</span>
          </div>

          {section.items.map((item: InspectionItem, itemIndex: number) => {
            const selected = (val: InspectionItemStatus) => item.status === val;

            const onStatusClick = (val: InspectionItemStatus) => {
              updateItem(sectionIndex, itemIndex, { status: val });

              if ((val === "fail" || val === "recommend") && (item.item || item.name)) {
                addQuoteLine({
                  item: item.item || (item as any).name || "Inspection Item",
                  description: item.notes || "",
                  status: val,
                  value: item.value ?? "",
                  notes: item.notes ?? "",
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

                {/* Value / Unit / Notes */}
                <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    value={(item.value as string | number | null) ?? ""}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { value: e.target.value })}
                    placeholder="Value"
                    className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                  />
                  <input
                    value={item.unit ?? ""}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { unit: e.target.value })}
                    placeholder={unitHint(item) || "Unit"}
                    className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400 sm:w-28"
                  />
                  <input
                    value={item.notes ?? ""}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
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
          })}
        </div>
      ))}

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
        <div className="text-xs text-zinc-400">P = PASS, F = FAIL, NA = Not Applicable</div>
      </div>
    </div>
  );
}