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

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

/** ----------------- small helpers ----------------- */
const asStr = (v: unknown) =>
  v === null || v === undefined ? "" : String(v);

const safe = <T,>(v: T | undefined, fallback: T) =>
  (v === undefined ? fallback : v);

const unitHint = (itemLabel?: string) => {
  const t = (itemLabel || "").toLowerCase();
  if (t.includes("tread") || t.includes("pad") || t.includes("lining") || t.includes("thickness")) return "mm";
  if (t.includes("pressure")) return "psi";
  if (t.includes("push rod")) return "in";
  if (t.includes("torque")) return "ft·lb";
  if (t.includes("moisture") || t.includes("level")) return "%";
  return "";
};

/** Resolve SpeechRecognition without touching global typings */
type SRConstructor = new () => SpeechRecognition;
function resolveSR(): SRConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

/** ----------------- page ----------------- */
export default function CustomRunPage() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  // UI state
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Header
  const templateName = searchParams.get("template") || "Custom Inspection";

  // IMPORTANT: satisfy SessionCustomer/SessionVehicle (all fields present)
  const customer = {
    first_name: searchParams.get("first_name") || "",
    last_name:  searchParams.get("last_name")  || "",
    phone:      searchParams.get("phone")      || "",
    email:      searchParams.get("email")      || "",
    address:    searchParams.get("address")    || "",
    city:       searchParams.get("city")       || "",
    province:   searchParams.get("province")   || "",
    postal_code:searchParams.get("postal_code")|| "",
  };

  const vehicle = {
    year:          searchParams.get("year")          || "",
    make:          searchParams.get("make")          || "",
    model:         searchParams.get("model")         || "",
    vin:           searchParams.get("vin")           || "",
    license_plate: searchParams.get("license_plate") || "",
    mileage:       searchParams.get("mileage")       || "",
    color:         searchParams.get("color")         || "",
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
      sections: [] as InspectionSection[],
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

  // boot
  useEffect(() => {
    startSession(initialSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // voice → commands
  const onTranscript = async (text: string) => {
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
      onTranscript(t);
    };
    recognition.onerror = (event: Event & { error: string }) => {
      console.error("Speech recognition error:", event.error);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Save as Template (exact sections)
  async function saveAsTemplate() {
    const sections = session?.sections ?? [];
    if (!sections.length) {
      alert("Nothing to save yet.");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Sign in to save templates.");
      return;
    }

    const payload: Database["public"]["Tables"]["inspection_templates"]["Insert"] = {
      id: crypto.randomUUID(),
      user_id: user.id,
      template_name: templateName,
      sections: sections as any,
      description: null,
      tags: null,
      vehicle_type: null,
      is_public: false,
    };

    const { error } = await supabase.from("inspection_templates").insert(payload);
    if (error) {
      console.error(error);
      alert("Failed to save template.");
      return;
    }
    alert("Template saved.");
  }

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="p-4 text-white">Loading inspection…</div>;
  }

  // Header card
  function HeaderCard() {
    return (
      <div className="mb-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-white">
        <h1 className="mb-3 text-center text-2xl font-bold">{templateName}</h1>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Vehicle */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">Vehicle Information</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="opacity-70">VIN</span><span className="truncate">{asStr(vehicle.vin) || "—"}</span>
              <span className="opacity-70">Year</span><span>{asStr(vehicle.year) || "—"}</span>
              <span className="opacity-70">Make</span><span>{asStr(vehicle.make) || "—"}</span>
              <span className="opacity-70">Model</span><span>{asStr(vehicle.model) || "—"}</span>
              <span className="opacity-70">Odometer</span><span>{asStr(vehicle.mileage) || "—"}</span>
              <span className="opacity-70">Plate</span><span>{asStr(vehicle.license_plate) || "—"}</span>
              <span className="opacity-70">Color</span><span>{asStr(vehicle.color) || "—"}</span>
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">Customer Information</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="opacity-70">Name</span>
              <span>{[customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"}</span>

              <span className="opacity-70">Phone</span><span>{asStr(customer.phone) || "—"}</span>
              <span className="opacity-70">Email</span><span className="truncate">{asStr(customer.email) || "—"}</span>

              <span className="opacity-70">Address</span>
              <span className="truncate">
                {[customer.address, customer.city, customer.province, customer.postal_code]
                  .filter(Boolean).join(", ") || "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

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

        <Button onClick={saveAsTemplate}>Save as Template</Button>
      </div>

      <ProgressTracker
        currentItem={session.currentItemIndex}
        currentSection={session.currentSectionIndex}
        totalSections={session.sections.length}
        totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
      />

      {session.sections.map((section: InspectionSection, sectionIndex: number) => (
        <div key={sectionIndex} className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-xl font-semibold text-orange-400">
              {section.title}
            </h2>
          </div>

          {section.items.map((item: InspectionItem, itemIndex: number) => {
            const selected = (val: InspectionItemStatus) => item.status === val;

            const onStatusClick = (val: InspectionItemStatus) => {
              updateItem(sectionIndex, itemIndex, { status: val });

              if ((val === "fail" || val === "recommend") && (item.item || item.name)) {
                addQuoteLine({
                  item: item.item ?? item.name ?? "",
                  description: item.notes || "",
                  status: val,
                  value: asStr(item.value ?? ""),
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
                    {item.item ?? item.name ?? "Item"}
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
                    value={asStr(item.value ?? "")}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { value: e.target.value })}
                    placeholder={
                      /torque/i.test(item.item ?? item.name ?? "")
                        ? "Torque value"
                        : /tread|pad|lining|thickness|mm/i.test(item.item ?? item.name ?? "")
                        ? "Value (mm)"
                        : "Value"
                    }
                    className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                  />
                  <input
                    value={asStr(safe(item.unit ?? null, unitHint(item.item ?? item.name ?? "")))}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { unit: e.target.value })}
                    placeholder={unitHint(item.item ?? item.name ?? "") || "Unit"}
                    className="sm:w-28 w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400"
                  />
                  <input
                    value={asStr(item.notes ?? "")}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, { notes: e.target.value })}
                    placeholder="Notes"
                    className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white placeholder:text-zinc-400 sm:col-span-1 col-span-1"
                  />
                </div>

                {(item.status === "fail" || item.status === "recommend") && (
                  <PhotoUploadButton
                    photoUrls={item.photoUrls || []}
                    onChange={(urls: string[]) =>
                      updateItem(sectionIndex, itemIndex, { photoUrls: urls })
                    }
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

      <div className="mt-8 flex items-center justify-between gap-4">
        <Button variant="secondary" onClick={saveAsTemplate}>Save as Template</Button>
        {/* If you already have dedicated components, you can keep them here */}
        {/* <SaveInspectionButton /> */}
        {/* <FinishInspectionButton /> */}
      </div>
    </div>
  );
}