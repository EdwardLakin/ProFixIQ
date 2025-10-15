"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

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

import { generateAxleLayout } from "@inspections/lib/inspection/generateAxleLayout";
import { axlesToSections } from "@inspections/lib/inspection/axleAdapters";
import { buildInspectionFromSelections } from "@inspections/lib/inspection/buildFromSelections";

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
/* Unit hints + Axles renderer                                        */
/* ------------------------------------------------------------------ */

function unitHint(label: string, mode: "metric" | "imperial") {
  const l = label.toLowerCase();
  if (l.includes("tread") || l.includes("lining") || l.includes("pad")) return mode === "metric" ? "mm" : "in";
  if (l.includes("pressure")) return mode === "metric" ? "kPa" : "psi";
  if (l.includes("push rod")) return mode === "metric" ? "mm" : "in";
  if (l.includes("wheel torque")) return mode === "metric" ? "N·m" : "ft·lb";
  if (l.includes("rotor") || l.includes("drum")) return mode === "metric" ? "mm" : "in";
  return "";
}

const AXLE_FULL_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const AXLE_SIDE_RE = /^(?<side>Left|Right)\s+(?<metric>.+)$/i;

type AxleRow = {
  axle: string;
  metric: string;
  left?: string | number | null;
  right?: string | number | null;
  leftIdx?: number;
  rightIdx?: number;
  unit?: string | null;
};

function AxlesSection({
  section,
  sectionIndex,
  unitMode,
  updateItem,
}: {
  section: InspectionSection;
  sectionIndex: number;
  unitMode: "metric" | "imperial";
  updateItem: (sectionIdx: number, itemIdx: number, patch: Partial<InspectionItem>) => void;
}) {
  const map = new Map<string, AxleRow>();

  section.items.forEach((it, idx) => {
    const label = (it.item ?? "").trim();
    let axle = "";
    let side: "Left" | "Right" | undefined;
    let metric = "";

    // Try "Steer Left Tread Depth"
    let m = label.match(AXLE_FULL_RE);
    if (m?.groups) {
      axle = m.groups.axle.trim();
      side = m.groups.side as "Left" | "Right";
      metric = m.groups.metric.trim();
    } else {
      // Fallback: "Left Tread Depth" with section.title as axle
      m = label.match(AXLE_SIDE_RE);
      if (m?.groups) {
        axle = section.title;
        side = m.groups.side as "Left" | "Right";
        metric = m.groups.metric.trim();
      }
    }

    if (!axle || !side || !metric) return;

    const key = `${axle}::${metric}`;
    const row = map.get(key) ?? { axle, metric };
    if (side === "Left") {
      row.left = (it.value as any) ?? "";
      row.leftIdx = idx;
    } else {
      row.right = (it.value as any) ?? "";
      row.rightIdx = idx;
    }
    row.unit = it.unit ?? unitHint(it.item ?? "", unitMode);
    map.set(key, row);
  });

  const rows = Array.from(map.values());

  return (
    <div className="space-y-3 rounded border border-zinc-700 bg-zinc-900 p-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded bg-zinc-950/70 p-3">
          <div className="mb-2 text-sm font-semibold text-orange-300">
            {r.axle} — {r.metric}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">Left</label>
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                value={String(r.left ?? "")}
                onChange={(e) =>
                  r.leftIdx != null && updateItem(sectionIndex, r.leftIdx, { value: e.target.value })
                }
                placeholder="Value"
              />
            </div>
            <div className="text-center text-xs text-zinc-400">
              {r.unit || unitHint(`${r.axle} Left ${r.metric}`, unitMode)}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">Right</label>
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-800/60 px-2 py-1 text-white"
                value={String(r.right ?? "")}
                onChange={(e) =>
                  r.rightIdx != null && updateItem(sectionIndex, r.rightIdx, { value: e.target.value })
                }
                placeholder="Value"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function CustomRunPage() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);
  const searchParams = useSearchParams();

  // UI state
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [, setTranscript] = useState("");

  // SR
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Header
  const templateName = searchParams.get("template") || "Custom Inspection Run";

  // These can be passed on the URL; default blanks are ok per your types
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
  };

  // Builder selections (produced by your builder UI)
  // Expect a JSON string under ?selections= and optional ?vehicleType=
  const selectionsParam = searchParams.get("selections"); // base64 or json
  const vehicleTypeParam =
    (searchParams.get("vehicleType") as "car" | "truck" | "bus" | "trailer" | null) || null;

  const builtSections = useMemo<InspectionSection[]>(() => {
    // Try to parse selections; if absent, start empty
    let selections: Record<string, string[]> = {};
    try {
      if (selectionsParam) {
        // allow plain JSON or base64 JSON
        const raw =
          selectionsParam.startsWith("{") || selectionsParam.startsWith("[")
            ? selectionsParam
            : atob(selectionsParam);
        selections = JSON.parse(raw);
      }
    } catch {
      selections = {};
    }

    const axleOpt = vehicleTypeParam ? { vehicleType: vehicleTypeParam } : null;
    const built = buildInspectionFromSelections({
      selections,
      axle: axleOpt,
      extraServiceItems: [],
    });

    // If the caller wants a *pure* axle layout without the flat “Axles” section,
    // convert to CVIP-style multi-sections:
    if (axleOpt) {
      const axles = generateAxleLayout(axleOpt.vehicleType);
      const axleSections = axlesToSections(axles);
      // Replace the “Axles” section (if present) with the expanded set
      const rest = built.filter((s) => s.title !== "Axles");
      return [...axleSections, ...rest];
    }

    return built;
  }, [selectionsParam, vehicleTypeParam]);

  // Initial session (empty; we’ll inject sections after mount)
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
    [templateName] // eslint-disable-line react-hooks/exhaustive-deps
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

  // start session once
  useEffect(() => {
    startSession(initialSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // inject built sections once session exists
  useEffect(() => {
    if (!session) return;
    if ((session.sections?.length ?? 0) === 0 && builtSections.length > 0) {
      updateInspection({ sections: builtSections });
    }
  }, [session, builtSections, updateInspection]);

  // voice handling
  const onTranscript = async (text: string) => {
    setTranscript(text);
    const cmds: ParsedCommand[] = await interpretCommand(text);
    for (const cmd of cmds) {
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

  // Save as Template → inspection_templates
  async function saveAsTemplate() {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return alert("Please sign in to save a template.");

    const name =
      prompt("Template name?", templateName || "Custom Template") || "Custom Template";
    const payload: Database["public"]["Tables"]["inspection_templates"]["Insert"] = {
      user_id: user.id,
      template_name: name,
      sections: (session?.sections ?? []) as any,
      description: "Saved from Custom Run page",
      vehicle_type: vehicleTypeParam,
      tags: ["custom", "run"],
      is_public: false,
    };

    const { error } = await supabase.from("inspection_templates").insert(payload);
    if (error) {
      console.error(error);
      alert("Failed to save template.");
    } else {
      alert("Template saved.");
    }
  }

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="text-white p-4">Loading inspection…</div>;
  }

  // simple header card (same style used on 50 pages)
  function HeaderCard() {
    return (
      <div className="mb-5 rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-white">
        <h1 className="mb-3 text-center text-2xl font-bold">{templateName}</h1>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Vehicle */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">
              Vehicle Information
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="opacity-70">VIN</label>
              <div className="truncate">{session.vehicle?.vin || "—"}</div>
              <label className="opacity-70">Year</label>
              <div>{session.vehicle?.year || "—"}</div>
              <label className="opacity-70">Make</label>
              <div>{session.vehicle?.make || "—"}</div>
              <label className="opacity-70">Model</label>
              <div>{session.vehicle?.model || "—"}</div>
              <label className="opacity-70">Plate</label>
              <div>{session.vehicle?.license_plate || "—"}</div>
              <label className="opacity-70">Mileage</label>
              <div>{session.vehicle?.mileage || "—"}</div>
              <label className="opacity-70">Color</label>
              <div>{session.vehicle?.color || "—"}</div>
            </div>
          </div>
          {/* Customer */}
          <div className="rounded-md border border-zinc-700 p-3">
            <div className="mb-2 text-sm font-semibold text-orange-400">
              Customer Information
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <label className="opacity-70">Name</label>
              <div>
                {[session.customer?.first_name, session.customer?.last_name]
                  .filter(Boolean)
                  .join(" ") || "—"}
              </div>
              <label className="opacity-70">Phone</label>
              <div>{session.customer?.phone || "—"}</div>
              <label className="opacity-70">Email</label>
              <div className="truncate">{session.customer?.email || "—"}</div>
              <label className="opacity-70">Address</label>
              <div className="col-span-1 truncate">
                {[
                  session.customer?.address,
                  session.customer?.city,
                  session.customer?.province,
                  session.customer?.postal_code,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
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

        <button
          onClick={saveAsTemplate}
          className="rounded bg-amber-600 px-3 py-2 text-white hover:bg-amber-500"
        >
          Save as Template
        </button>
      </div>

      <ProgressTracker
        currentItem={session.currentItemIndex}
        currentSection={session.currentSectionIndex}
        totalSections={session.sections.length}
        totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
      />

      {session.sections.map((section: InspectionSection, sectionIndex: number) => {
        const isAxles =
          section.title === "Axles" || /(steer|drive|trailer)/i.test(section.title);

        return (
          <div
            key={sectionIndex}
            className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="mb-2 flex items-end justify-between">
              <h2 className="text-xl font-semibold text-orange-400">
                {section.title}
              </h2>
              {isAxles ? (
                <span className="text-xs text-zinc-400">
                  Enter mm / in / kPa / psi / N·m / ft·lb
                </span>
              ) : null}
            </div>

            {isAxles ? (
              <AxlesSection
                section={section}
                sectionIndex={sectionIndex}
                unitMode={unit}
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
                  <div
                    key={itemIndex}
                    className="mb-3 rounded border border-zinc-800 bg-zinc-950 p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h3 className="min-w-0 truncate text-base font-medium text-white">
                        {item.item ?? (item as any).name ?? "Item"}
                      </h3>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {(["ok", "fail", "na", "recommend"] as InspectionItemStatus[]).map(
                          (val) => (
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
                          ),
                        )}
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
                        value={item.unit ?? unitHint(item.item || "", unit)}
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

      <div className="mt-8 flex items-center justify-between gap-4">
        <SaveInspectionButton session={session} />
        <FinishInspectionButton session={session} />
      </div>
    </div>
  );
}