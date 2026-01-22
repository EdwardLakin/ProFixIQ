"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import PauseResumeButton from "@inspections/lib/inspection/PauseResume";
import StartListeningButton from "@inspections/lib/inspection/StartListeningButton";
import ProgressTracker from "@inspections/lib/inspection/ProgressTracker";
import useInspectionSession from "@inspections/hooks/useInspectionSession";

import { handleTranscriptFn } from "@inspections/lib/inspection/handleTranscript";
import { interpretCommand } from "@inspections/components/inspection/interpretCommand";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";
import { addWorkOrderLineFromSuggestion } from "@inspections/lib/inspection/addWorkOrderLine";

import type {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
  InspectionSection,
  InspectionSession,
  SessionCustomer,
  SessionVehicle,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

import SectionDisplay from "@inspections/lib/inspection/SectionDisplay";
import CornerGrid from "@inspections/lib/inspection/ui/CornerGrid";
import AirCornerGrid from "@inspections/lib/inspection/ui/AirCornerGrid";
import TireGrid from "@inspections/lib/inspection/ui/TireCornerGrid";
import BatteryGrid from "@inspections/lib/inspection/ui/BatteryGrid";

import { InspectionFormCtx } from "@inspections/lib/inspection/ui/InspectionFormContext";
import { SaveInspectionButton } from "@inspections/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@inspections/components/inspection/FinishInspectionButton";
import CustomerVehicleHeader from "@inspections/lib/inspection/ui/CustomerVehicleHeader";
import InspectionSignaturePanel from "@inspections/components/inspection/InspectionSignaturePanel";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";

/* -------------------------- helpers -------------------------- */

type GenericInspectionScreenProps = {
  embed?: boolean;
  template?: string | null;
  params?: Record<string, string | number | boolean | null | undefined>;
  onSpecHint?: (payload: {
    source: "air_corner" | "corner" | "tire" | "item" | "battery" | "other";
    label: string;
    specCode?: string | null;
    meta?: Record<string, string | number | boolean | null | undefined>;
  }) => void;
};

function toHeaderCustomer(c?: SessionCustomer | null) {
  return {
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    city: c?.city ?? "",
    province: c?.province ?? "",
    postal_code: c?.postal_code ?? "",
  };
}
function toHeaderVehicle(v?: SessionVehicle | null) {
  return {
    year: v?.year ?? "",
    make: v?.make ?? "",
    model: v?.model ?? "",
    vin: v?.vin ?? "",
    license_plate: v?.license_plate ?? "",
    mileage: v?.mileage ?? "",
    color: v?.color ?? "",
    unit_number: v?.unit_number ?? "",
    engine_hours: v?.engine_hours ?? "",
  };
}

function unitHintGeneric(label: string, mode: "metric" | "imperial"): string {
  const l = (label || "").toLowerCase();
  if (l.includes("pressure")) return mode === "imperial" ? "psi" : "kPa";
  if (l.includes("tread")) return mode === "metric" ? "mm" : "in";
  if (l.includes("pad") || l.includes("lining") || l.includes("shoe"))
    return mode === "metric" ? "mm" : "in";
  if (l.includes("rotor") || l.includes("drum"))
    return mode === "metric" ? "mm" : "in";
  if (l.includes("push rod")) return mode === "metric" ? "mm" : "in";
  if (l.includes("torque")) return mode === "metric" ? "N·m" : "ft·lb";
  if (l.includes("leak rate")) return mode === "metric" ? "kPa/min" : "psi/min";
  if (l.includes("gov cut") || l.includes("warning"))
    return mode === "metric" ? "kPa" : "psi";
  return "";
}

function readStaged<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function normalizeSections(input: unknown): InspectionSection[] {
  try {
    const arr = Array.isArray(input) ? input : [];
    const byTitle = new Map<string, InspectionSection>();

    for (const s of arr as any[]) {
      const title = String(s?.title ?? "").trim();
      if (!title) continue;

      const itemsRaw = Array.isArray(s?.items) ? s.items : [];
      const items = itemsRaw
        .map((it: any) => {
          const label = String(it?.item ?? it?.name ?? "").trim();
          if (!label) return null;
          return {
            ...it,
            item: label,
            unit: it?.unit ?? null,
          };
        })
        .filter(Boolean);

      if (!byTitle.has(title)) byTitle.set(title, { title, items: [] });
      const bucket = byTitle.get(title)!;
      const seen = new Set(
        (bucket.items ?? []).map((x) => (x.item ?? "").toLowerCase()),
      );
      for (const it of items as any[]) {
        const key = (it.item ?? "").toLowerCase();
        if (seen.has(key)) continue;
        bucket.items = [...(bucket.items ?? []), it];
        seen.add(key);
      }
    }

    return Array.from(byTitle.values()).filter((s) => (s.items?.length ?? 0) > 0);
  } catch {
    return [];
  }
}

function toTemplateSections(sections: InspectionSection[]): InspectionSection[] {
  return sections
    .map((sec) => ({
      title: sec.title,
      items: (sec.items ?? [])
        .map((it) => {
          const label = (it.item ?? "").trim();
          if (!label) return null;
          return {
            item: label,
            unit: it.unit ?? null,
          };
        })
        .filter((x): x is { item: string; unit: string | null } => !!x),
    }))
    .filter((sec) => sec.items.length > 0);
}

/* -------- smarter grid detectors -------- */

const AIR_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;
const HYD_ABBR_RE = /^(?<corner>LF|RF|LR|RR)\s+(?<metric>.+)$/i;
const HYD_FULL_RE =
  /^(?<corner>(Left|Right)\s+(Front|Rear))\s+(?<metric>.+)$/i;

function isBatterySection(
  title: string | undefined,
  items: { item?: string | null }[] = [],
): boolean {
  const t = (title || "").toLowerCase();
  if (t.includes("battery")) return true;
  return items.some((it) => (it.item || "").toLowerCase().includes("battery"));
}

function isAirCornerSection(
  title: string | undefined,
  items: { item?: string | null }[] = [],
): boolean {
  const t = (title || "").toLowerCase();
  if (t.includes("air corner") || t.includes("air corner grid")) return true;
  if (t.includes("tires & brakes — air")) return true;
  return items.some((it) => AIR_RE.test(it.item ?? ""));
}

/**
 * TireGrid expects items shaped like:
 *   "<Axle> Left Tire Pressure"
 *   "<Axle> Right Tread Depth (Inner)"
 *   "<Axle> Left Wheel Torque"
 *
 * If we force "Tires & Wheels" (generic) into TireGrid, it renders blank.
 * So: only use TireGrid when the section actually contains grid-shaped rows.
 */
const LABEL_SIDE_RE = /^(?<axle>.+?)\s+(?<side>Left|Right)\s+(?<metric>.+)$/i;

function isAllowedTireMetric(metric: string): boolean {
  const m = (metric || "").toLowerCase();
  return (
    m.includes("tire pressure") ||
    m.includes("tire tread") ||
    m.includes("tread depth") ||
    m.includes("wheel torque")
  );
}

function hasTireGridData(items: { item?: string | null }[] = []): boolean {
  return items.some((it) => {
    const label = it.item ?? "";
    if (!LABEL_SIDE_RE.test(label)) return false;
    const match = label.match(LABEL_SIDE_RE);
    const metric = match?.groups?.metric ?? "";
    return isAllowedTireMetric(metric);
  });
}

function isTireGridSection(
  title: string | undefined,
  items: { item?: string | null }[] = [],
): boolean {
  const t = (title || "").toLowerCase();

  // explicit / intended naming
  if (t.includes("tire grid") || t.includes("tires grid")) return true;
  if (t.includes("tires") && t.includes("corner")) return true;

  // heuristic: only treat as tire grid if the items look like a tire grid
  return hasTireGridData(items);
}

function isHydraulicCornerSection(
  title: string | undefined,
  items: { item?: string | null }[] = [],
): boolean {
  const t = (title || "").toLowerCase();

  // never treat tires-only sections as hydraulic corner grid
  if (isTireGridSection(title, items)) return false;

  if (t.includes("corner grid") || t.includes("tires & brakes — truck")) return true;
  if (t.includes("axle grid")) return true;

  if (!items || items.length < 4) return false;

  return items.some((it) => {
    const label = it.item ?? "";
    return HYD_ABBR_RE.test(label) || HYD_FULL_RE.test(label);
  });
}

/* --------------------------------- types / constants --------------------------------- */

type VehicleTypeParam = "car" | "truck" | "bus" | "trailer";

type InsertTemplate =
  Database["public"]["Tables"]["inspection_templates"]["Insert"] & {
    labor_hours?: number | null;
  };

const UNIT_OPTIONS = ["", "mm", "psi", "kPa", "in", "ft·lb"] as const;

function inspectionDraftKey(args: {
  inspectionId: string;
  workOrderLineId?: string | null;
  workOrderId?: string | null;
  templateName?: string | null;
}) {
  const t = (args.templateName || "Inspection").toLowerCase().trim();
  if (args.workOrderLineId) return `inspection-draft:line:${args.workOrderLineId}`;
  if (args.workOrderId) return `inspection-draft:wo:${args.workOrderId}:${t}`;
  return `inspection-draft:template:${t}:${args.inspectionId}`;
}

function buildCauseCorrectionFromSession(
  s: any,
): { cause: string; correction: string } {
  const sections: any[] = Array.isArray(s?.sections) ? s.sections : [];

  const failed: string[] = [];
  const rec: string[] = [];

  for (const sec of sections) {
    const title = String(sec?.title ?? "").trim();
    const items: any[] = Array.isArray(sec?.items) ? sec.items : [];
    for (const it of items) {
      const st = String(it?.status ?? "").toLowerCase();
      if (st !== "fail" && st !== "recommend") continue;

      const label = String(it?.item ?? it?.name ?? it?.description ?? "Item").trim();
      const note = String(it?.notes ?? "").trim();
      const chunk = note ? `${label} — ${note}` : label;
      const line = title ? `${title}: ${chunk}` : chunk;

      if (st === "fail") failed.push(line);
      if (st === "recommend") rec.push(line);
    }
  }

  if (failed.length === 0 && rec.length === 0) {
    return {
      cause: "Inspection completed.",
      correction:
        "Inspection completed. No failed or recommended items were recorded.",
    };
  }

  const parts: string[] = [];
  if (failed.length) parts.push(`Failed items: ${failed.join("; ")}.`);
  if (rec.length) parts.push(`Recommended items: ${rec.join("; ")}.`);

  return {
    cause: "Inspection found items requiring attention.",
    correction: parts.join(" "),
  };
}

/* -------------------------------------------------------------------- */
/* Component                                                            */
/* -------------------------------------------------------------------- */

export default function GenericInspectionScreen(
  _props: GenericInspectionScreenProps,
): JSX.Element {
  const routeSp = useSearchParams();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  const sp = useMemo(() => {
    const staged = readStaged<Record<string, string>>("inspection:params");

    if (staged && Object.keys(staged).length > 0) {
      const merged = new URLSearchParams();

      Object.entries(staged).forEach(([key, value]) => {
        if (value != null) merged.set(key, String(value));
      });

      routeSp.forEach((value, key) => {
        merged.set(key, value);
      });

      return merged;
    }

    return routeSp;
  }, [routeSp]);

  const isMobileView = (sp.get("view") || "").toLowerCase() === "mobile";

  const isEmbed = useMemo(
    () =>
      ["1", "true", "yes"].includes(
        (sp.get("embed") || sp.get("compact") || "").toLowerCase(),
      ),
    [sp],
  );

  // ✅ Accept common param variants (camel + snake + legacy)
  const workOrderId =
    sp.get("workOrderId") || sp.get("work_order_id") || null;

  const workOrderLineId =
    sp.get("workOrderLineId") ||
    sp.get("work_order_line_id") ||
    sp.get("lineId") ||
    "";

  const rawVehicleType = sp.get("vehicleType") as VehicleTypeParam | null;
  const templateVehicleType: VehicleTypeParam | undefined =
    rawVehicleType && ["car", "truck", "bus", "trailer"].includes(rawVehicleType)
      ? rawVehicleType
      : undefined;

  const showMissingLineWarning = isEmbed && !workOrderLineId;

  const templateName =
    (typeof window !== "undefined"
      ? sessionStorage.getItem("inspection:title")
      : null) || sp.get("template") || "Inspection";

  const customer: SessionCustomer = {
    first_name: sp.get("first_name") || "",
    last_name: sp.get("last_name") || "",
    phone: sp.get("phone") || "",
    email: sp.get("email") || "",
    address: sp.get("address") || "",
    city: sp.get("city") || "",
    province: sp.get("province") || "",
    postal_code: sp.get("postal_code") || "",
  };
  const vehicle: SessionVehicle = {
    year: sp.get("year") || "",
    make: sp.get("make") || "",
    model: sp.get("model") || "",
    vin: sp.get("vin") || "",
    license_plate: sp.get("license_plate") || "",
    mileage: sp.get("mileage") || "",
    color: sp.get("color") || "",
    unit_number: sp.get("unit_number") || "",
    engine_hours: sp.get("engine_hours") || "",
  };

  const bootSections = useMemo<InspectionSection[]>(() => {
    const staged = readStaged<InspectionSection[]>("inspection:sections");
    if (Array.isArray(staged) && staged.length) return normalizeSections(staged);

    try {
      const legacy =
        typeof window !== "undefined"
          ? sessionStorage.getItem("customInspection:sections")
          : null;
      if (legacy) {
        const parsed = JSON.parse(legacy) as InspectionSection[];
        return normalizeSections(parsed);
      }
    } catch {}

    return [
      {
        title: "General",
        items: [{ item: "Visual walkaround" }, { item: "Record warning lights" }],
      },
    ];
  }, [sp]);

  const inspectionId = useMemo(() => {
    const fromUrl = sp.get("inspectionId");
    if (fromUrl) return fromUrl;

    if (typeof window === "undefined") return uuidv4();

    const storageKey = workOrderLineId
      ? `inspection:activeId:line:${workOrderLineId}`
      : workOrderId
        ? `inspection:activeId:wo:${workOrderId}:${templateName}`
        : `inspection:activeId:template:${templateName}`;

    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;

    const created = uuidv4();
    sessionStorage.setItem(storageKey, created);
    return created;
  }, [sp, workOrderLineId, workOrderId, templateName]);

  const draftKey = useMemo(
    () =>
      inspectionDraftKey({
        inspectionId,
        workOrderLineId: workOrderLineId || null,
        workOrderId,
        templateName,
      }),
    [inspectionId, workOrderLineId, workOrderId, templateName],
  );

  const lockKey = `${draftKey}:locked`;

  const persistedSession = useMemo(() => {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(draftKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as InspectionSession;
    } catch {
      return null;
    }
  }, [draftKey]);

  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const [newItemLabels, setNewItemLabels] = useState<Record<number, string>>({});
  const [newItemUnits, setNewItemUnits] = useState<Record<number, string>>({});

  const [collapsedSections, setCollapsedSections] =
    useState<Record<number, boolean>>({});

  const [wakeActive, setWakeActive] = useState(false);
  const wakeTimeoutRef = useRef<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const initialSession = useMemo<Partial<InspectionSession>>(
    () => ({
      id: inspectionId,
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
    [inspectionId, templateName, customer, vehicle],
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
    updateQuoteLine,
  } = useInspectionSession(persistedSession ?? initialSession);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(lockKey);
      setIsLocked(raw === "1");
    } catch {
      // ignore
    }
  }, [lockKey]);

  const guardLocked = (): boolean => {
    if (!isLocked) return false;
    toast.error("This inspection is signed and locked. Editing is disabled.");
    return true;
  };

  /* ------------------------------ Part 2/3 ------------------------------ */

  useEffect(() => {
    if (persistedSession) {
      startSession(persistedSession);
    } else {
      startSession(initialSession);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedSession]);

  useEffect(() => {
    if (session && (session.sections?.length ?? 0) === 0) {
      updateInspection({ sections: bootSections });
    }
  }, [session, bootSections, updateInspection]);

  useEffect(() => {
    if (!session) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(session));
    } catch {
      // ignore
    }
  }, [session, draftKey]);

  useEffect(() => {
    const persistNow = () => {
      try {
        const payload = session ?? initialSession;
        localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {}
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("beforeunload", persistNow);
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", persistNow);
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session, draftKey, initialSession]);

  useEffect(() => {
    const handler = (evt: Event) => {
      const e = evt as CustomEvent<any>;
      const detail = e.detail || {};
      const wol = String(detail.workOrderLineId || "");
      if (!wol) return;

      const merged =
        detail.cause && detail.correction
          ? { cause: detail.cause, correction: detail.correction }
          : buildCauseCorrectionFromSession(session);

      window.dispatchEvent(
        new CustomEvent("causeCorrection:prefill", {
          detail: {
            workOrderLineId: wol,
            cause: merged.cause,
            correction: merged.correction,
            source: "inspection",
          },
        }),
      );

      try {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(lockKey);
      } catch {}
    };

    window.addEventListener("inspection:completed", handler as EventListener);
    return () =>
      window.removeEventListener("inspection:completed", handler as EventListener);
  }, [session, draftKey, lockKey]);

  const handleTranscript = async (text: string): Promise<void> => {
    if (!session || guardLocked()) return;
    const commands: ParsedCommand[] = await interpretCommand(text);
    const sess = session;
    if (!sess) return;
    for (const command of commands) {
      await handleTranscriptFn({
        command,
        session: sess,
        updateInspection,
        updateItem,
        updateSection,
        finishSession,
      });
    }
  };

  function maybeHandleWakeWord(raw: string): string | null {
    const cleaned = raw.trim();
    const lower = cleaned.toLowerCase();

    const WAKE_PREFIXES = ["techy", "techie", "tekky", "teki"];

    const matchPrefix = (): { prefix: string; remainder: string } | null => {
      for (const prefix of WAKE_PREFIXES) {
        if (lower.startsWith(prefix + " ")) {
          return {
            prefix,
            remainder: cleaned.slice(prefix.length).trimStart(),
          };
        }
        if (lower === prefix) {
          return { prefix, remainder: "" };
        }
      }
      return null;
    };

    if (!wakeActive) {
      const match = matchPrefix();
      if (!match) return null;

      setWakeActive(true);

      if (wakeTimeoutRef.current) {
        window.clearTimeout(wakeTimeoutRef.current);
      }
      wakeTimeoutRef.current = window.setTimeout(() => {
        setWakeActive(false);
      }, 8000);

      return match.remainder;
    }

    if (wakeTimeoutRef.current) {
      window.clearTimeout(wakeTimeoutRef.current);
    }
    wakeTimeoutRef.current = window.setTimeout(() => {
      setWakeActive(false);
    }, 8000);

    return cleaned;
  }

  const startListening = async (): Promise<void> => {
    if (isListening) return;
    if (guardLocked()) return;
    try {
      const res = await fetch("/api/openai/realtime-token");
      const { apiKey } = (await res.json()) as { apiKey: string };
      if (!apiKey) throw new Error("Missing OpenAI key");

      const ws = new WebSocket(
        "wss://api.openai.com/v1/realtime?intent=transcription",
      );
      wsRef.current = ws;

      ws.onopen = async () => {
        ws.send(
          JSON.stringify({
            type: "authorization",
            authorization: `Bearer ${apiKey}`,
          }),
        );

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRef.current = stream;

        const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
        mediaRecorderRef.current = mr;
        mr.ondataavailable = (evt) => {
          if (evt.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(evt.data);
          }
        };
        mr.start(250);

        setIsListening(true);
      };

      ws.onmessage = async (evt) => {
        if (typeof evt.data !== "string") return;
        try {
          const msg = JSON.parse(evt.data);
          const text: string =
            msg.text || msg.transcript || msg.output || msg.content || "";
          if (!text) return;

          const maybeText = maybeHandleWakeWord(text);
          if (!maybeText) return;

          const lower = maybeText.toLowerCase();
          if (lower === "stop listening" || lower === "go to sleep") {
            setWakeActive(false);
            return;
          }

          await handleTranscript(maybeText);
        } catch {
          // ignore
        }
      };

      ws.onerror = (err) => {
        // eslint-disable-next-line no-console
        console.error("realtime ws error", err);
        toast.error("Voice connection error");
        stopListening();
      };

      ws.onclose = () => {
        stopListening();
      };
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(e);
      toast.error(e?.message || "Unable to start voice");
      stopListening();
    }
  };

  const stopListening = (): void => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;

    mediaRef.current?.getTracks().forEach((t) => t.stop());
    mediaRef.current = null;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setIsListening(false);
    setWakeActive(false);
    if (wakeTimeoutRef.current) {
      window.clearTimeout(wakeTimeoutRef.current);
      wakeTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inFlightRef = useRef<Set<string>>(new Set());
  const isSubmittingAI = (secIdx: number, itemIdx: number): boolean =>
    inFlightRef.current.has(`${secIdx}:${itemIdx}`);

  const submitAIForItem = async (
    secIdx: number,
    itemIdx: number,
  ): Promise<void> => {
    if (!session) return;
    if (isLocked) {
      toast.error("Inspection is locked; AI suggestions are disabled.");
      return;
    }

    const key = `${secIdx}:${itemIdx}`;
    if (inFlightRef.current.has(key)) return;

    const it = session.sections[secIdx].items[itemIdx];
    const status = String(it.status ?? "").toLowerCase();
    const note = (it.notes ?? "").trim();

    if (!(status === "fail" || status === "recommend")) return;
    if (note.length === 0) {
      toast.error("Add a note before submitting.");
      return;
    }

    const manualParts =
      (((it as any).parts ?? []) as { description: string; qty: number }[]) || [];
    const manualLaborHours =
      ((it as any).laborHours as number | null | undefined) ?? null;

    inFlightRef.current.add(key);
    let toastId: string | undefined;
    try {
      const desc = it.item ?? (it as any).name ?? "Item";

      const id = uuidv4();
      const placeholder: QuoteLineItem = {
        id,
        description: desc,
        item: desc,
        name: desc,
        status: status as "fail" | "recommend",
        notes: it.notes ?? "",
        price: 0,
        laborTime: 0.5,
        laborRate: 0,
        editable: true,
        source: "inspection",
        value: it.value ?? "",
        photoUrls: it.photoUrls ?? [],
        aiState: "loading",
      };
      addQuoteLine(placeholder);

      toastId = toast.loading("Building estimate from inspection item…");
      const suggestion = await requestQuoteSuggestion({
        item: desc,
        notes: it.notes ?? "",
        section: session.sections[secIdx].title,
        status,
        vehicle: session.vehicle ?? undefined,
      });

      if (!suggestion) {
        updateQuoteLine(id, { aiState: "error" });
        toast.error("No AI suggestion available", { id: toastId });
        return;
      }

      const mergedParts: any[] = [
        ...(suggestion.parts ?? []),
        ...manualParts.map((p) => ({
          name: p.description,
          qty: p.qty,
          cost: undefined,
        })),
      ];

      const laborTime =
        manualLaborHours != null && !Number.isNaN(manualLaborHours)
          ? manualLaborHours
          : suggestion.laborHours ?? 0.5;

      const laborRate = suggestion.laborRate ?? 0;
      const partsTotal =
        mergedParts.reduce(
          (sum, p) => sum + (typeof p.cost === "number" ? p.cost : 0),
          0,
        ) ?? 0;
      const price = Math.max(0, partsTotal + laborRate * laborTime);

      updateQuoteLine(id, {
        price,
        laborTime,
        laborRate,
        ai: {
          summary: suggestion.summary,
          confidence: suggestion.confidence,
          parts: mergedParts,
        },
        aiState: "done",
      });

      let createdJobId: string | null = null;

      if (workOrderId) {
        const created = (await addWorkOrderLineFromSuggestion({
          workOrderId,
          description: desc,
          section: session.sections[secIdx].title,
          status: status as "fail" | "recommend",
          suggestion: {
            ...suggestion,
            parts: mergedParts,
            laborHours: laborTime,
          } as any,
          source: "inspection",
          jobType: "repair",
        })) as any;

        createdJobId = (created && created.id) || workOrderLineId || null;

        const cleanParts = manualParts
          .map((p) => ({
            description: p.description.trim(),
            qty: p.qty,
          }))
          .filter((p) => p.description.length > 0 && p.qty > 0);

        if (cleanParts.length > 0) {
          try {
            const res = await fetch("/api/parts/requests/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workOrderId,
                jobId: createdJobId,
                notes: it.notes ?? null,
                items: cleanParts,
              }),
            });

            if (!res.ok) {
              const body = await res.json().catch(() => null);
              // eslint-disable-next-line no-console
              console.error("Parts request error", body);
              toast.error("Line added, but parts request failed", { id: toastId });
              return;
            }

            toast.success("Line + parts request created from inspection", {
              id: toastId,
            });
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("Parts request failed", err);
            toast.error("Line added, but couldn't reach parts request service", {
              id: toastId,
            });
          }
        } else {
          toast.success("Added to work order (no parts requested)", { id: toastId });
        }
      } else {
        toast.error("Missing work order id — saved locally only", { id: toastId });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Submit AI failed:", e);
      toast.error("Couldn't add to work order");
    } finally {
      inFlightRef.current.delete(key);
    }
  };

  useEffect(() => {
    if (!isEmbed) return;
    const root = rootRef.current;
    if (!root) return;

    const BAD = [
      "h-screen",
      "min-h-screen",
      "max-h-screen",
      "overflow-hidden",
      "fixed",
      "inset-0",
      "w-screen",
      "overscroll-contain",
      "touch-pan-y",
    ];

    const scrub = (el: HTMLElement) => {
      if (!el.className) return;
      const classes = el.className.split(" ");
      const filtered = classes.filter((c) => c && !BAD.includes(c));
      if (filtered.length !== classes.length) {
        el.className = filtered.join(" ");
      }
      if (el.style?.overflow === "hidden") {
        el.style.overflow = "visible";
      }
    };

    root.querySelectorAll<HTMLElement>("*").forEach(scrub);

    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes" && m.target instanceof HTMLElement) {
          scrub(m.target);
        }
        if (m.type === "childList") {
          m.addedNodes.forEach((n) => {
            if (n instanceof HTMLElement) {
              scrub(n);
              n.querySelectorAll?.("*")?.forEach((child) => {
                if (child instanceof HTMLElement) scrub(child as HTMLElement);
              });
            }
          });
        }
      }
    });

    obs.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => obs.disconnect();
  }, [isEmbed]);

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="p-4 text-sm text-neutral-300">Loading inspection…</div>;
  }

  const currentSectionIndex =
    typeof session.currentSectionIndex === "number"
      ? session.currentSectionIndex
      : 0;
  const safeSectionIndex =
    currentSectionIndex >= 0 && currentSectionIndex < session.sections.length
      ? currentSectionIndex
      : 0;

  function autoAdvanceFrom(secIdx: number, itemIdx: number): void {
    const sections = session.sections;
    if (!sections || sections.length === 0) return;

    let sIdx = secIdx;
    let iIdx = itemIdx + 1;

    while (sIdx < sections.length) {
      const itemsLen = sections[sIdx].items?.length ?? 0;
      if (iIdx < itemsLen) break;
      sIdx += 1;
      iIdx = 0;
    }

    if (sIdx >= sections.length) {
      const lastSectionIndex = sections.length - 1;
      const lastItems = sections[lastSectionIndex].items ?? [];
      const lastItemIndex = Math.max(0, lastItems.length - 1);
      updateInspection({
        currentSectionIndex: lastSectionIndex,
        currentItemIndex: lastItemIndex,
      });
      return;
    }

    updateInspection({
      currentSectionIndex: sIdx,
      currentItemIndex: iIdx,
    });
  }

  function applyStatusToSection(
    sectionIndex: number,
    status: InspectionItemStatus,
  ): void {
    if (guardLocked()) return;
    const section = session.sections[sectionIndex];
    if (!section) return;
    const nextItems = (section.items ?? []).map((it) => ({
      ...it,
      status,
    }));
    updateSection(sectionIndex, { ...section, items: nextItems });
    updateInspection({
      currentSectionIndex: sectionIndex,
      currentItemIndex: 0,
    });
  }

  function toggleSectionCollapsed(sectionIndex: number): void {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionIndex]: !prev[sectionIndex],
    }));
  }

  // Mobile footer uses these, but voice now also works on desktop via the top buttons.
  const handleStartMobile = (): void => {
    if (guardLocked()) return;
    setIsPaused(false);
    resumeSession();
    void startListening();
  };

  const handlePauseMobile = (): void => {
    setIsPaused(true);
    pauseSession();
    stopListening();
  };

  const saveCurrentAsTemplate = async (): Promise<void> => {
    if (!session) return;
    if (savingTemplate) return;

    const cleanedSections = toTemplateSections(session.sections);
    if (cleanedSections.length === 0) {
      toast.error("Nothing to save — no sections with items.");
      return;
    }

    try {
      setSavingTemplate(true);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      if (!uid) {
        toast.error("Please sign in to save this as a template.");
        return;
      }

      let resolvedShopId: string | null = null;

      const byUser = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (byUser.data?.shop_id) {
        resolvedShopId = String(byUser.data.shop_id);
      } else {
        const byId = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("id", uid)
          .maybeSingle();
        resolvedShopId = byId.data?.shop_id ? String(byId.data.shop_id) : null;
      }

      if (!resolvedShopId) {
        toast.error("No shop_id found for your profile.");
        return;
      }

      const baseName = session.templateitem || templateName || "Inspection Template";
      const template_name = `${baseName} (from run)`;

      const totalItems = cleanedSections.reduce((sum, s) => sum + s.items.length, 0);
      const labor_hours = totalItems > 0 ? Number((totalItems * 0.1).toFixed(2)) : null;

      const payload: InsertTemplate = {
        user_id: uid,
        shop_id: resolvedShopId,
        template_name,
        sections:
          cleanedSections as unknown as Database["public"]["Tables"]["inspection_templates"]["Insert"]["sections"],
        description: "Saved from an in-progress inspection run.",
        vehicle_type: templateVehicleType,
        tags: ["run_saved", "custom"],
        is_public: false,
        labor_hours,
      };

      const { error, data } = await supabase
        .from("inspection_templates")
        .insert(payload)
        .select("id")
        .maybeSingle();

      if (error || !data?.id) {
        // eslint-disable-next-line no-console
        console.error(error);
        toast.error(error?.message || "Failed to save template from inspection.");
        return;
      }

      toast.success("Template saved. You can reuse it under Templates.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleAddCustomItem = (sectionIndex: number): void => {
    if (!session) return;
    if (guardLocked()) return;

    const label = (newItemLabels[sectionIndex] || "").trim();
    if (!label) {
      toast.error("Enter a label for the new item.");
      return;
    }

    const unitRaw = newItemUnits[sectionIndex] ?? "";
    const unitValue = unitRaw || null;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const nextItems = [
      ...(section.items ?? []),
      { item: label, unit: unitValue, status: "na" as InspectionItemStatus },
    ];

    updateSection(sectionIndex, { ...section, items: nextItems });
    setNewItemLabels((prev) => ({ ...prev, [sectionIndex]: "" }));
  };

  /** Add axle rows to an AIR corner grid section */
  const handleAddAxleForSection = (
    sectionIndex: number,
    axleLabel: string,
  ): void => {
    if (!session) return;
    if (guardLocked()) return;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const existingItems = section.items ?? [];

    const metrics: Array<{ label: string; unit: string | null }> = [
      { label: "Tire Pressure", unit: "psi" },
      { label: "Tread Depth (Outer)", unit: "mm" },
      { label: "Tread Depth (Inner)", unit: "mm" },
      { label: "Lining/Shoe", unit: "mm" },
      { label: "Drum/Rotor", unit: "mm" },
      { label: "Push Rod Travel", unit: "in" },
    ];

    const sides: Array<"Left" | "Right"> = ["Left", "Right"];

    const existingLabels = new Set(
      existingItems.map((it) =>
        String(it.item ?? (it as any).name ?? "").toLowerCase(),
      ),
    );

    const nextItems = [...existingItems];

    for (const side of sides) {
      for (const m of metrics) {
        const label = `${axleLabel} ${side} ${m.label}`;
        const key = label.toLowerCase();
        if (existingLabels.has(key)) continue;

        nextItems.push({
          item: label,
          unit: m.unit,
          status: "na" as InspectionItemStatus,
        });
        existingLabels.add(key);
      }
    }

    updateSection(sectionIndex, { ...section, items: nextItems });
  };

  /** Add axle rows to a TIRE grid section (tires only) */
  const handleAddTireAxleForSection = (
    sectionIndex: number,
    axleLabel: string,
  ): void => {
    if (!session) return;
    if (guardLocked()) return;

    const section = session.sections[sectionIndex];
    if (!section) return;

    const existingItems = section.items ?? [];

    const metrics: Array<{ label: string; unit: string | null }> = [
      { label: "Tire Pressure", unit: "psi" },
      { label: "Tread Depth (Outer)", unit: "mm" },
      { label: "Tread Depth (Inner)", unit: "mm" },
      { label: "Wheel Torque", unit: "ft·lb" },
    ];

    const sides: Array<"Left" | "Right"> = ["Left", "Right"];

    const existingLabels = new Set(
      existingItems.map((it) =>
        String(it.item ?? (it as any).name ?? "").toLowerCase(),
      ),
    );

    const nextItems = [...existingItems];

    for (const side of sides) {
      for (const m of metrics) {
        const label = `${axleLabel} ${side} ${m.label}`;
        const key = label.toLowerCase();
        if (existingLabels.has(key)) continue;

        nextItems.push({
          item: label,
          unit: m.unit,
          status: "na" as InspectionItemStatus,
        });
        existingLabels.add(key);
      }
    }

    updateSection(sectionIndex, { ...section, items: nextItems });
  };

  const handleSigned = (): void => {
    setIsLocked(true);
    try {
      localStorage.setItem(lockKey, "1");
    } catch {
      // ignore
    }
    toast.success("Inspection snapshot locked by signature.");
  };

  const shell =
    isEmbed || isMobileView
      ? "relative mx-auto max-w-[1100px] px-3 py-4 pb-36"
      : "relative mx-auto max-w-5xl px-3 md:px-4 py-6 pb-20";

  const cardBase =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/65 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  const headerCard = `${cardBase} px-3 py-3 md:px-6 md:py-5 mb-4 md:mb-6`;
  const sectionCard = `${cardBase} px-3 py-3 md:px-5 md:py-5 mb-4 md:mb-6`;

  const sectionTitle =
    "text-base md:text-xl font-semibold text-orange-300 text-center tracking-[0.16em] uppercase";
  const hint =
    "mt-1 block text-center text-[11px] uppercase tracking-[0.14em] text-neutral-400";

  const actions = (
    <>
      <SaveInspectionButton session={session as any} workOrderLineId={workOrderLineId} />
      <FinishInspectionButton session={session as any} workOrderLineId={workOrderLineId} />
      <Button
        type="button"
        variant="outline"
        className="border-sky-500/70 bg-black/60 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100 hover:border-sky-400 hover:bg-black/80"
        onClick={saveCurrentAsTemplate}
        disabled={savingTemplate}
      >
        {savingTemplate ? "Saving Template…" : "Save as Template"}
      </Button>
    </>
  );

  /* ------------------------------ Part 3/3 ------------------------------ */

  const body = (
    <div ref={rootRef} className={shell + (isEmbed ? " inspection-embed" : "")}>
      {isEmbed && (
        <style jsx global>{`
          .inspection-embed,
          .inspection-embed * {
            overscroll-behavior: auto !important;
          }
        `}</style>
      )}

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
      />

      <div className="relative space-y-4">
        <div className={headerCard}>
          <div className="mb-3 border-b border-orange-500/40 pb-3 text-center">
            <div className="text-[11px] font-blackops uppercase tracking-[0.22em] text-neutral-400">
              Inspection
            </div>
            <div className="mt-1 text-lg md:text-xl font-blackops text-neutral-50">
              {session?.templateitem || templateName || "Inspection"}
            </div>
          </div>

          <CustomerVehicleHeader
            templateName=""
            customer={toHeaderCustomer(session.customer ?? null)}
            vehicle={toHeaderVehicle(session.vehicle ?? null)}
          />
        </div>

        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {/* ✅ Voice controls now render on BOTH desktop and mobile (previously mobile-only) */}
          {!isLocked && (
            <StartListeningButton
              isListening={isListening}
              setIsListening={setIsListening}
              onStart={startListening}
            />
          )}

          {!isLocked && (
            <PauseResumeButton
              isPaused={isPaused}
              isListening={isListening}
              setIsListening={setIsListening}
              onPause={(): void => {
                setIsPaused(true);
                pauseSession();
                stopListening();
              }}
              onResume={(): void => {
                setIsPaused(false);
                resumeSession();
                void startListening();
              }}
              recognitionInstance={null}
              onTranscript={handleTranscript}
              setRecognitionRef={(): void => {
                /* noop – using OpenAI now */
              }}
            />
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full justify-center border-orange-500/70 bg-black/60 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-100 hover:border-orange-400 hover:bg-black/80"
            onClick={(): void =>
              setUnit(unit === "metric" ? "imperial" : "metric")
            }
          >
            Unit: {unit === "metric" ? "Metric (mm / kPa)" : "Imperial (in / psi)"}
          </Button>
        </div>

        <div className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 px-3 py-2.5 md:px-4 md:py-3 shadow-[0_18px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
          <ProgressTracker
            currentItem={session.currentItemIndex}
            currentSection={session.currentSectionIndex}
            totalSections={session.sections.length}
            totalItems={
              session.sections[session.currentSectionIndex]?.items.length || 0
            }
          />
        </div>

        <InspectionFormCtx.Provider value={{ updateItem }}>
          {session.sections.map((section: InspectionSection, sectionIndex: number) => {
            const itemsWithHints = section.items.map((it) => ({
              ...it,
              unit: it.unit || unitHintGeneric(it.item ?? "", unit),
            }));

            const batterySection = isBatterySection(section.title, itemsWithHints);
            const airSection = isAirCornerSection(section.title, itemsWithHints);
            const tireSection = isTireGridSection(section.title, itemsWithHints);
            const hydCornerSection = isHydraulicCornerSection(
              section.title,
              itemsWithHints,
            );

            const useGrid =
              batterySection || airSection || tireSection || hydCornerSection;

            const collapsed = collapsedSections[sectionIndex] ?? false;

            const newLabel = newItemLabels[sectionIndex] ?? "";
            const newUnit = newItemUnits[sectionIndex] ?? "";

            return (
              <div key={`${section.title}-${sectionIndex}`} className={sectionCard}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className={sectionTitle}>{section.title}</h2>

                  {safeSectionIndex === sectionIndex && (
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "ok")}
                      >
                        All OK
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-red-500/60 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-200 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "fail")}
                      >
                        All Fail
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-zinc-500/60 bg-zinc-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-200 hover:bg-zinc-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "na")}
                      >
                        All NA
                      </button>
                      <button
                        type="button"
                        disabled={isLocked}
                        className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => applyStatusToSection(sectionIndex, "recommend")}
                      >
                        All REC
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-neutral-500/60 bg-neutral-800/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-700"
                        onClick={() => toggleSectionCollapsed(sectionIndex)}
                      >
                        {collapsed ? "Expand" : "Collapse"}
                      </button>
                    </div>
                  )}

                  {safeSectionIndex !== sectionIndex && (
                    <button
                      type="button"
                      className="rounded-full border border-neutral-600/70 bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-800"
                      onClick={() => toggleSectionCollapsed(sectionIndex)}
                    >
                      {collapsed ? "Expand" : "Collapse"}
                    </button>
                  )}
                </div>

                {collapsed ? (
                  <p className="mt-2 text-center text-[11px] text-neutral-400">
                    Section collapsed. Tap{" "}
                    <span className="font-semibold">Expand</span> to reopen.
                  </p>
                ) : (
                  <>
                    {useGrid && (
                      <span className={hint}>
                        {unit === "metric"
                          ? "Enter mm / kPa / N·m"
                          : "Enter in / psi / ft·lb"}
                      </span>
                    )}

                    <div className="mt-3 md:mt-4">
                      {useGrid ? (
                        batterySection ? (
                          <BatteryGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label) => unitHintGeneric(label, unit)}
                          />
                        ) : airSection ? (
                          <AirCornerGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label) => unitHintGeneric(label, unit)}
                            onAddAxle={(axleLabel) =>
                              handleAddAxleForSection(sectionIndex, axleLabel)
                            }
                            onSpecHint={(metricLabel) =>
                              _props.onSpecHint?.({
                                source: "air_corner",
                                label: metricLabel,
                                meta: { sectionTitle: section.title },
                              })
                            }
                          />
                        ) : tireSection ? (
                          <TireGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label) => unitHintGeneric(label, unit)}
                            onAddAxle={(axleLabel) =>
                              handleAddTireAxleForSection(sectionIndex, axleLabel)
                            }
                            onSpecHint={(metricLabel) =>
                              _props.onSpecHint?.({
                                source: "tire",
                                label: metricLabel,
                                meta: { sectionTitle: section.title },
                              })
                            }
                          />
                        ) : (
                          <CornerGrid
                            sectionIndex={sectionIndex}
                            items={itemsWithHints}
                            unitHint={(label) => unitHintGeneric(label, unit)}
                            onSpecHint={(label) =>
                              _props.onSpecHint?.({
                                source: "corner",
                                label,
                                meta: { sectionTitle: section.title },
                              })
                            }
                          />
                        )
                      ) : (
                        <>
                          <SectionDisplay
                            title=""
                            section={{ ...section, items: itemsWithHints }}
                            sectionIndex={sectionIndex}
                            showNotes
                            showPhotos
                            onUpdateStatus={(secIdx, itemIdx, statusValue) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { status: statusValue });
                              autoAdvanceFrom(secIdx, itemIdx);
                            }}
                            onUpdateNote={(secIdx, itemIdx, note) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { notes: note });
                            }}
                            onUpload={(photoUrl, secIdx, itemIdx) => {
                              if (guardLocked()) return;
                              const prev =
                                session.sections[secIdx].items[itemIdx].photoUrls ??
                                [];
                              updateItem(secIdx, itemIdx, {
                                photoUrls: [...prev, photoUrl],
                              });
                            }}
                            onUpdateParts={(secIdx, itemIdx, parts) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { parts });
                            }}
                            onUpdateLaborHours={(secIdx, itemIdx, hours) => {
                              if (guardLocked()) return;
                              updateItem(secIdx, itemIdx, { laborHours: hours });
                            }}
                            requireNoteForAI
                            onSubmitAI={(secIdx, itemIdx) => {
                              void submitAIForItem(secIdx, itemIdx);
                            }}
                            isSubmittingAI={isSubmittingAI}
                          />

                          <div className="mt-4 border-t border-white/10 pt-3">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
                              Add custom item
                            </div>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center">
                              <input
                                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900/80 px-3 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                                placeholder="Item label (e.g. Rear frame inspection)"
                                value={newLabel}
                                onChange={(e) =>
                                  setNewItemLabels((prev) => ({
                                    ...prev,
                                    [sectionIndex]: e.target.value,
                                  }))
                                }
                                disabled={isLocked}
                              />
                              <div className="flex items-center gap-2 md:w-auto">
                                <select
                                  className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-2 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70"
                                  value={newUnit}
                                  onChange={(e) =>
                                    setNewItemUnits((prev) => ({
                                      ...prev,
                                      [sectionIndex]: e.target.value,
                                    }))
                                  }
                                  title="Measurement unit"
                                  disabled={isLocked}
                                >
                                  {UNIT_OPTIONS.map((u) => (
                                    <option key={u || "blank"} value={u}>
                                      {u || "— unit —"}
                                    </option>
                                  ))}
                                </select>
                                <Button
                                  type="button"
                                  className="whitespace-nowrap px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]"
                                  onClick={() => handleAddCustomItem(sectionIndex)}
                                  disabled={isLocked}
                                >
                                  + Add Item
                                </Button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </InspectionFormCtx.Provider>

        <div className="mt-2">
          <InspectionSignaturePanel
            inspectionId={inspectionId}
            role="customer"
            defaultName={
              [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
              undefined
            }
            onSigned={handleSigned}
          />
        </div>

        {!isEmbed && !isMobileView && (
          <div className="mt-4 md:mt-6 flex flex-col gap-4 border-t border-white/5 pt-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {actions}
              {showMissingLineWarning && (
                <div className="text-xs text-red-400">
                  Missing <code>workOrderLineId</code> — save/finish will be blocked.
                </div>
              )}
            </div>

            <div className="text-xs text-neutral-400 md:text-right">
              <span className="font-semibold text-neutral-200">Legend:</span> P =
              Pass &nbsp;•&nbsp; F = Fail &nbsp;•&nbsp; NA = Not applicable
            </div>
          </div>
        )}
      </div>

      {isEmbed && !isMobileView && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/92 px-3 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-400">
              Draft auto-saves locally
            </div>
          </div>
        </div>
      )}

      {isMobileView && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/95 px-3 py-2 backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button
                type="button"
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]"
                onClick={handleStartMobile}
                disabled={isLocked}
              >
                {isLocked ? "Locked" : "Start"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]"
                onClick={handlePauseMobile}
              >
                {isPaused ? "Resume" : "Pause"}
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="scale-90">
                <SaveInspectionButton session={session as any} workOrderLineId={workOrderLineId} />
              </div>
              <div className="scale-90">
                <FinishInspectionButton session={session as any} workOrderLineId={workOrderLineId} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isEmbed || isMobileView) {
    return body;
  }

  return (
    <PageShell
      title={session?.templateitem || templateName || "Inspection"}
      description="Run guided inspections, capture notes, and push items into work orders."
    >
      {body}
    </PageShell>
  );
}