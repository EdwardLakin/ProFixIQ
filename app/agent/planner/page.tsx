"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
import { WorkOrderPreviewTrigger } from "app/work-orders/components/WorkOrderPreviewTrigger";
import { WorkOrderPreview } from "app/work-orders/components/WorkOrderPreview";
import VinCaptureModal from "app/vehicle/VinCaptureModal";
import type {
  PlannerExecutionResult,
  PlannerProposal,
} from "@/features/agent/lib/plannerProposal";

type OcrFields = {
  vin?: string | null;
  plate?: string | null;
  year?: string | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  engine?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

type PlannerKind = "simple" | "openai" | "ops" | "fleet" | "approvals";

type PlannerPreset = {
  id: PlannerKind;
  label: string;
  description: string;
};

type PlannerLane =
  | "parts_follow_up"
  | "low_inventory_reorder"
  | "fleet_follow_up"
  | "smart_match_readiness"
  | "menu_item_efficiency_review"
  | "inspection_template_efficiency_review"
  | "menu_item_draft"
  | "inspection_template_draft"
  | "service_bundle_draft"
  | "resolve_approval_queue"
  | "reschedule_booking"
  | "work_order_operations";

const LANE_LABEL: Record<PlannerLane, string> = {
  parts_follow_up: "Parts follow-up",
  low_inventory_reorder: "Low inventory reorder",
  fleet_follow_up: "Fleet follow-up",
  smart_match_readiness: "Smart Match readiness",
  menu_item_efficiency_review: "Menu item efficiency review",
  inspection_template_efficiency_review: "Inspection template efficiency review",
  menu_item_draft: "Menu item draft",
  inspection_template_draft: "Inspection template draft",
  service_bundle_draft: "Service bundle draft",
  resolve_approval_queue: "Resolve approval queue",
  reschedule_booking: "Reschedule booking",
  work_order_operations: "Work-order operations",
};

type PlannerStartOut = {
  runId: string;
  alreadyExists: boolean;
  error?: string;
};

type PlannerEvent = Record<string, unknown> & { kind?: string };
type AnyObj = Record<string, unknown>;

function isObj(v: unknown): v is AnyObj {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function getField(obj: unknown, key: string): unknown {
  return isObj(obj) ? obj[key] : undefined;
}

function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const p of path) cur = getField(cur, p);
  return cur;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function toMsg(e: unknown): string {
  if (typeof e === "string") return e;
  if (isObj(e)) {
    const m = asString(e.message);
    if (m) return m;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

function extractToolName(evt: PlannerEvent): string | null {
  return (
    asString(getField(evt, "name")) ??
    asString(getField(evt, "tool_name")) ??
    asString(getField(evt, "toolName")) ??
    asString(getNested(evt, ["tool", "name"])) ??
    asString(getNested(evt, ["call", "name"]))
  );
}

function extractWorkOrderId(evt: PlannerEvent): string | null {
  const direct =
    asString(getField(evt, "work_order_id")) ??
    asString(getField(evt, "workOrderId")) ??
    asString(getField(evt, "wo_id")) ??
    asString(getField(evt, "entityId")) ??
    asString(getField(evt, "id"));

  if (direct) return direct;

  const output = getField(evt, "output");
  if (isObj(output)) {
    const nested =
      asString(output.workOrderId) ??
      asString(output.work_order_id) ??
      asString(output.id);
    if (nested) return nested;
  }

  const result = getField(evt, "result");
  if (isObj(result)) {
    const nested =
      asString(result.workOrderId) ??
      asString(result.work_order_id) ??
      asString(result.id);
    if (nested) return nested;
  }

  return null;
}

function extractNotifications(evt: PlannerEvent): Array<{
  level?: string;
  title?: string;
  message?: string;
  href?: string;
}> {
  const items = getField(evt, "items");
  if (!Array.isArray(items)) return [];

  const out: Array<{
    level?: string;
    title?: string;
    message?: string;
    href?: string;
  }> = [];

  for (const item of items) {
    if (!isObj(item)) continue;

    out.push({
      level: asString(item.level) ?? undefined,
      title: asString(item.title) ?? undefined,
      message: asString(item.message) ?? undefined,
      href: asString(item.href) ?? undefined,
    });
  }

  return out;
}

function extractProposal(evt: PlannerEvent): PlannerProposal | null {
  const raw = getField(evt, "proposal");
  if (!isObj(raw)) return null;

  const classification = asString(raw.classification);
  if (
    classification !== "draft_only" &&
    classification !== "confirmable_write" &&
    classification !== "informational"
  ) {
    return null;
  }

  const stringList = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((entry) => asString(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [];

  return {
    id: asString(raw.id) ?? crypto.randomUUID(),
    lane: asString(raw.lane) ?? "",
    classification,
    title: asString(raw.title) ?? "Proposal",
    summary: asString(raw.summary) ?? "",
    proposed_steps: stringList(raw.proposed_steps),
    affected_records: Array.isArray(raw.affected_records)
      ? raw.affected_records
          .filter((item) => isObj(item))
          .map((item) => ({
            type: asString(item.type) ?? "record",
            id: asString(item.id) ?? "",
            href: asString(item.href) ?? "#",
            label: asString(item.label) ?? "Record",
          }))
      : [],
    warnings: stringList(raw.warnings),
    review_actions: stringList(raw.review_actions),
    duplicate_candidates: stringList(raw.duplicate_candidates),
    source_rationale: stringList(raw.source_rationale),
    confirmation_required: getField(raw, "confirmation_required") === true,
    execution_available: getField(raw, "execution_available") === true,
    execution_label: asString(raw.execution_label) ?? "Confirm and apply",
    not_executable_reason: asString(raw.not_executable_reason) ?? undefined,
    result_summary: asString(raw.result_summary) ?? undefined,
    result_links: Array.isArray(raw.result_links)
      ? raw.result_links
          .filter((item) => isObj(item))
          .map((item) => ({
            href: asString(item.href) ?? "#",
            label: asString(item.label) ?? "Result",
          }))
      : [],
    audit: {
      generated_at:
        asString(getNested(raw, ["audit", "generated_at"])) ??
        new Date().toISOString(),
      run_id: asString(getNested(raw, ["audit", "run_id"])) ?? undefined,
      event_step:
        typeof getNested(raw, ["audit", "event_step"]) === "number"
          ? (getNested(raw, ["audit", "event_step"]) as number)
          : undefined,
    },
    execution_payload: isObj(raw.execution_payload)
      ? {
          lane: asString(raw.execution_payload.lane) ?? "",
          action: asString(raw.execution_payload.action) ?? "",
          data: isObj(raw.execution_payload.data) ? raw.execution_payload.data : {},
        }
      : undefined,
    execution_result: undefined,
  };
}

function labelFor(evt: PlannerEvent): string | null {
  const kind = (evt.kind ?? "").toString();
  const toolName = extractToolName(evt);
  const woId = extractWorkOrderId(evt);

  const text =
    asString(getField(evt, "text")) ??
    asString(getField(evt, "message")) ??
    asString(getField(evt, "error"));

  switch (kind) {
    case "plan":
      return text ? `Plan: ${text}` : "Planning…";

    case "tool_call":
      return `Tool call: ${toolName ?? "unknown"}`;

    case "tool_result":
      if (woId && toolName === "create_work_order") {
        return `Created work order (${woId.slice(0, 8)})`;
      }
      return `Tool result: ${toolName ?? "unknown"}`;

    case "wo.created":
    case "work_order.created":
      return `Created work order${woId ? ` (${woId.slice(0, 8)})` : ""}`;

    case "wo.line.created":
    case "work_order_line.created": {
      const desc = asString(getField(evt, "description"));
      return `Added job line${desc ? ` — ${desc.slice(0, 80)}` : ""}`;
    }

    case "notifications": {
      const items = extractNotifications(evt);
      if (items.length === 0) return "New alerts";
      return items
        .slice(0, 2)
        .map((item) => item.title ?? item.message ?? "Alert")
        .join(" • ");
    }

    case "proposal": {
      const proposal = extractProposal(evt);
      return proposal ? `Proposal staged: ${proposal.title}` : "Proposal staged";
    }

    case "final":
      return text ? `Final: ${text}` : "Final";

    default:
      return kind ? kind.replaceAll("_", " ") : null;
  }
}

export default function PlannerPage() {
  const [goal, setGoal] = useState("");
  const [planner, setPlanner] = useState<PlannerKind>("ops");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [allowCreate, setAllowCreate] = useState(false);
  const [lane, setLane] = useState<PlannerLane | null>(null);

  const [customerQuery, setCustomerQuery] = useState("");
  const [plateOrVin, setPlateOrVin] = useState("");
  const [emailInvoiceTo, setEmailInvoiceTo] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | null>(null);
  const [resolvedVehicleId, setResolvedVehicleId] = useState<string | null>(null);
  const [hydratingContext, setHydratingContext] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [steps, setSteps] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<
    Array<{
      level?: string;
      title?: string;
      message?: string;
      href?: string;
    }>
  >([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [proposals, setProposals] = useState<PlannerProposal[]>([]);
  const [applyConfirmations, setApplyConfirmations] = useState<Record<string, boolean>>({});
  const [applyingProposalId, setApplyingProposalId] = useState<string | null>(null);
  const [executionResults, setExecutionResults] = useState<
    Record<string, PlannerExecutionResult>
  >({});

  const esRef = useRef<EventSource | null>(null);
  const autoRanRef = useRef(false);

  const [previewWoId, setPreviewWoId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [vinOpen, setVinOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const supabase = createBrowserSupabase();
  const draft = useWorkOrderDraft();
  const setVehicleDraft = useWorkOrderDraft((s) => s.setVehicle);
  const setCustomerDraft = useWorkOrderDraft((s) => s.setCustomer);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data.user?.id ?? null);
    });
    return () => {
      mounted = false;
    };
  }, [supabase]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [photoPreview]);

  useEffect(() => {
    const v = (draft?.vehicle?.vin ?? "").trim();
    if (v && !plateOrVin) setPlateOrVin(v);

    const em = (draft?.customer?.email ?? "").trim();
    if (em && !emailInvoiceTo) setEmailInvoiceTo(em);
  }, [draft, emailInvoiceTo, plateOrVin]);

  useEffect(() => {
    const plannerParam = searchParams.get("planner");
    const goalParam = searchParams.get("goal");
    const customerParam = searchParams.get("customerQuery");
    const customerIdParam = searchParams.get("customerId");
    const vehicleIdParam = searchParams.get("vehicleId");
    const plateParam = searchParams.get("plateOrVin");
    const emailParam = searchParams.get("emailInvoiceTo");
    const bookingParam = searchParams.get("bookingId");
    const workOrderParam = searchParams.get("workOrderId");
    const allowCreateParam = searchParams.get("allowCreate");
    const laneParam = searchParams.get("lane");

    if (
      plannerParam === "ops" ||
      plannerParam === "openai" ||
      plannerParam === "simple" ||
      plannerParam === "fleet" ||
      plannerParam === "approvals"
    ) {
      setPlanner(plannerParam);
    }

    if (goalParam) setGoal(goalParam);
    if (customerParam) setCustomerQuery(customerParam);
    if (!customerParam && customerIdParam) setCustomerQuery(customerIdParam);
    if (customerIdParam) setResolvedCustomerId(customerIdParam);
    if (plateParam) setPlateOrVin(plateParam);
    if (!plateParam && vehicleIdParam) setPlateOrVin(vehicleIdParam);
    if (vehicleIdParam) setResolvedVehicleId(vehicleIdParam);
    if (emailParam) setEmailInvoiceTo(emailParam);
    if (bookingParam) setBookingId(bookingParam);
    if (workOrderParam) setWorkOrderId(workOrderParam);
    if (allowCreateParam === "1") setAllowCreate(true);
    if (allowCreateParam === "0") setAllowCreate(false);
    if (
      laneParam === "parts_follow_up" ||
      laneParam === "low_inventory_reorder" ||
      laneParam === "fleet_follow_up" ||
      laneParam === "smart_match_readiness" ||
      laneParam === "menu_item_efficiency_review" ||
      laneParam === "inspection_template_efficiency_review" ||
      laneParam === "menu_item_draft" ||
      laneParam === "inspection_template_draft" ||
      laneParam === "service_bundle_draft" ||
      laneParam === "resolve_approval_queue" ||
      laneParam === "reschedule_booking" ||
      laneParam === "work_order_operations"
    ) {
      setLane(laneParam);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateFromContext() {
      const customerIdParam = searchParams.get("customerId");
      const vehicleIdParam = searchParams.get("vehicleId");
      const workOrderIdParam = searchParams.get("workOrderId");

      if (!customerIdParam && !vehicleIdParam && !workOrderIdParam) {
        setHydratingContext(false);
        return;
      }

      setHydratingContext(true);

      let nextCustomerId: string | null = customerIdParam;
      let nextVehicleId: string | null = vehicleIdParam;

      try {
        if (workOrderIdParam) {
          const { data: wo } = await supabase
            .from("work_orders")
            .select("id, customer_id, vehicle_id")
            .eq("id", workOrderIdParam)
            .maybeSingle();

          if (cancelled) return;

          if (wo?.customer_id && !nextCustomerId) nextCustomerId = wo.customer_id;
          if (wo?.vehicle_id && !nextVehicleId) nextVehicleId = wo.vehicle_id;
        }

        if (nextCustomerId) {
          setResolvedCustomerId(nextCustomerId);

          const { data: customer } = await supabase
            .from("customers")
            .select("id, first_name, last_name, business_name, email")
            .eq("id", nextCustomerId)
            .maybeSingle();

          if (cancelled) return;

          const businessName =
            typeof customer?.business_name === "string"
              ? customer.business_name.trim()
              : "";
          const fullName = [customer?.first_name ?? "", customer?.last_name ?? ""]
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter(Boolean)
            .join(" ");

          const displayName = businessName || fullName;

          if (displayName && !customerQuery.trim()) {
            setCustomerQuery(displayName);
          }

          if (
            typeof customer?.email === "string" &&
            customer.email.trim() &&
            !emailInvoiceTo.trim()
          ) {
            setEmailInvoiceTo(customer.email.trim());
          }

          setCustomerDraft({
            first_name:
              typeof customer?.first_name === "string"
                ? customer.first_name
                : undefined,
            last_name:
              typeof customer?.last_name === "string"
                ? customer.last_name
                : undefined,
            email:
              typeof customer?.email === "string" ? customer.email : undefined,
            phone: undefined,
          });
        }

        if (nextVehicleId) {
          setResolvedVehicleId(nextVehicleId);

          const { data: vehicle } = await supabase
            .from("vehicles")
            .select("id, vin, license_plate, year, make, model, trim, engine")
            .eq("id", nextVehicleId)
            .maybeSingle();

          if (cancelled) return;

          const preferred =
            typeof vehicle?.vin === "string" && vehicle.vin.trim()
              ? vehicle.vin.trim()
              : typeof vehicle?.license_plate === "string" &&
                vehicle.license_plate.trim()
              ? vehicle.license_plate.trim()
              : "";

          if (preferred && !plateOrVin.trim()) {
            setPlateOrVin(preferred);
          }

          setVehicleDraft({
            vin: typeof vehicle?.vin === "string" ? vehicle.vin : undefined,
            plate:
              typeof vehicle?.license_plate === "string"
                ? vehicle.license_plate
                : undefined,
            year: typeof vehicle?.year === "string" ? vehicle.year : undefined,
            make: typeof vehicle?.make === "string" ? vehicle.make : undefined,
            model: typeof vehicle?.model === "string" ? vehicle.model : undefined,
            trim: typeof vehicle?.trim === "string" ? vehicle.trim : undefined,
            engine:
              typeof vehicle?.engine === "string" ? vehicle.engine : undefined,
          });
        }
      } finally {
        if (!cancelled) setHydratingContext(false);
      }
    }

    void hydrateFromContext();

    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    searchParams,
    customerQuery,
    emailInvoiceTo,
    plateOrVin,
    setCustomerDraft,
    setVehicleDraft,
  ]);

  function onPickPhoto(file: File | null) {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadPhotoIfAny(): Promise<string | undefined> {
    if (!photo) return undefined;

    const path = `agent-uploads/${crypto
      .randomUUID()
      .replace(/-/g, "")}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const up = await supabase.storage.from("agent-uploads").upload(path, photo, {
      cacheControl: "3600",
      upsert: false,
    });

    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

    const pub = supabase.storage.from("agent-uploads").getPublicUrl(path);
    if (!pub.data?.publicUrl) throw new Error("Could not resolve public URL");

    return pub.data.publicUrl;
  }

  function clearAll() {
    setGoal("");
    setCustomerQuery("");
    setPlateOrVin("");
    setEmailInvoiceTo("");
    setBookingId("");
    setWorkOrderId("");
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(null);
    setPhotoPreview(null);
    setSteps([]);
    setSummary(null);
    setNotifications([]);
    setProposals([]);
    setApplyConfirmations({});
    setExecutionResults({});
    setRunId(null);
    setPreviewWoId(null);
    setPreviewOpen(false);
    esRef.current?.close();
    esRef.current = null;
    setRunning(false);
    autoRanRef.current = false;
  }

  function appendStep(step: string) {
    setSteps((arr) => (arr.includes(step) ? arr : [...arr, step]));
  }

  async function start() {
    setRunning(true);
    setSteps([]);
    setSummary(null);
    setNotifications([]);
    setProposals([]);
    setApplyConfirmations({});
    setExecutionResults({});
    esRef.current?.close();
    esRef.current = null;

    try {
      if (!allowCreate) {
        const hasCustomer =
          customerQuery.trim().length > 0 || Boolean(workOrderId.trim());
        const hasPlateVin =
          plateOrVin.trim().length > 0 ||
          (draft?.vehicle?.vin ?? "").trim().length > 0 ||
          Boolean(workOrderId.trim()) ||
          Boolean(bookingId.trim());

        if (!hasCustomer && !hasPlateVin && !goal.trim()) {
          appendStep("Missing enough context to run in Existing DB mode.");
          setRunning(false);
          return;
        }
      }

      const imageUrl = await uploadPhotoIfAny();

      if (imageUrl && photoPreview) URL.revokeObjectURL(photoPreview);
      if (imageUrl) {
        setPhoto(null);
        setPhotoPreview(null);
      }

      let ocrFields: OcrFields | null = null;

      if (imageUrl) {
        appendStep("Uploading photo…");

        try {
          const res = await fetch("/api/ocr/registration", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ imageUrl }),
          });

          if (res.ok) {
            const j = (await res.json()) as { fields?: OcrFields | null };
            const f = j?.fields || {};

            setVehicleDraft({
              vin: f.vin ?? undefined,
              plate: f.plate ?? undefined,
              year: f.year ?? undefined,
              make: f.make ?? undefined,
              model: f.model ?? undefined,
              trim: f.trim ?? undefined,
              engine: f.engine ?? undefined,
            });

            setCustomerDraft({
              first_name: f.first_name ?? undefined,
              last_name: f.last_name ?? undefined,
              phone: f.phone ?? undefined,
              email: f.email ?? undefined,
            });

            if (!plateOrVin && (f.vin || f.plate)) {
              setPlateOrVin(f.vin || f.plate || "");
            }

            if (!emailInvoiceTo && f.email) {
              setEmailInvoiceTo(f.email || "");
            }

            const quickBits = [
              f.vin ? `VIN ${String(f.vin).slice(0, 8)}…` : null,
              f.plate ? `Plate ${f.plate}` : null,
              f.email ? `Email ${f.email}` : null,
            ]
              .filter(Boolean)
              .join(" • ");

            appendStep(`OCR parsed: ${quickBits || "basic details"}`);
            ocrFields = f;
          } else {
            appendStep(`OCR failed (HTTP ${res.status})`);
          }
        } catch (err: unknown) {
          appendStep(`OCR error: ${toMsg(err)}`);
        }
      }

      const vinFromDraft = (draft?.vehicle?.vin ?? "").trim() || undefined;

      const decodedVehicle =
        draft?.vehicle &&
        (draft.vehicle.year ||
          draft.vehicle.make ||
          draft.vehicle.model ||
          draft.vehicle.trim ||
          draft.vehicle.engine)
          ? {
              year: draft.vehicle.year ?? null,
              make: draft.vehicle.make ?? null,
              model: draft.vehicle.model ?? null,
              trim: draft.vehicle.trim ?? null,
              engine: draft.vehicle.engine ?? null,
            }
          : undefined;

      const ctx = {
        allowCreate,

        customerQuery: customerQuery || undefined,
        customerId: resolvedCustomerId ?? undefined,
        vehicleId: resolvedVehicleId ?? undefined,
        plateOrVin: plateOrVin || vinFromDraft || undefined,
        emailInvoiceTo: emailInvoiceTo || undefined,
        bookingId: bookingId || undefined,
        workOrderId: workOrderId || undefined,

        imageUrl,
        vin:
          vinFromDraft || (plateOrVin?.length === 17 ? plateOrVin : undefined),
        decodedVehicle,
        ocr: ocrFields || undefined,

        lineDescription: goal.trim() || undefined,
        jobType: "repair" as const,
        laborHours: 1,
        plannerKind: planner,
        lane: lane ?? undefined,
      } satisfies Record<string, unknown>;

      const res = await fetch("/api/planner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          planner,
          context: ctx,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      const out = (await res.json().catch(() => ({}))) as PlannerStartOut;

      if (!res.ok) {
        throw new Error(out.error ?? `HTTP ${res.status}`);
      }

      setRunId(out.runId);
      appendStep(out.alreadyExists ? "Resumed previous run…" : "Started plan…");

      const url = `/api/planner/events?runId=${encodeURIComponent(out.runId)}`;
      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (ev) => {
        if (!ev.data || ev.data === ":ok" || ev.data === "[DONE]") return;

        try {
          const data = JSON.parse(ev.data) as PlannerEvent;
          const label = labelFor(data);
          if (label) appendStep(label);

          const maybeId = extractWorkOrderId(data);
          const tool = extractToolName(data);

          if (
            (data.kind === "wo.created" ||
              data.kind === "work_order.created" ||
              (data.kind === "tool_result" && tool === "create_work_order")) &&
            typeof maybeId === "string"
          ) {
            setPreviewWoId(maybeId);
            setPreviewOpen(true);
          }

          if (data.kind === "final") {
            const text =
              asString(getField(data, "text")) ??
              asString(getField(data, "message"));
            if (text) setSummary(text);
          }

          if (data.kind === "notifications") {
            const items = extractNotifications(data);
            if (items.length > 0) {
              setNotifications((prev) => [...prev, ...items]);
            }
          }

          if (data.kind === "proposal") {
            const proposal = extractProposal(data);
            if (proposal) {
              setProposals((prev) => [...prev, proposal]);
            }
          }

          if (data.kind === "final") {
            es.close();
            esRef.current = null;
            setRunning(false);
          }
        } catch {
          appendStep(ev.data);
        }
      };

      es.onerror = () => {
        if (esRef.current) {
          appendStep("Stream ended");
          es.close();
          esRef.current = null;
          setRunning(false);
        }
      };
    } catch (e: unknown) {
      appendStep(`Error: ${toMsg(e)}`);
      setRunning(false);
    }
  }

  async function applyProposal(proposal: PlannerProposal) {
    if (!runId) {
      appendStep("Apply blocked: missing run id.");
      return;
    }
    if (!applyConfirmations[proposal.id]) {
      appendStep("Apply blocked: confirm review before apply.");
      return;
    }
    setApplyingProposalId(proposal.id);
    try {
      const res = await fetch("/api/planner/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId,
          proposalId: proposal.id,
          confirmationToken: "CONFIRM_APPLY",
          applyKey: crypto.randomUUID(),
        }),
      });
      const out = (await res.json().catch(() => ({}))) as {
        error?: string;
        proposalId?: string;
        result?: PlannerExecutionResult;
      };
      if (!res.ok || !out.result || !out.proposalId) {
        throw new Error(out.error ?? `Apply failed (HTTP ${res.status})`);
      }
      setExecutionResults((prev) => ({ ...prev, [out.proposalId as string]: out.result as PlannerExecutionResult }));
      appendStep(out.result.summary);
    } catch (error: unknown) {
      appendStep(`Apply failed: ${toMsg(error)}`);
    } finally {
      setApplyingProposalId(null);
    }
  }

  useEffect(() => {
    const shouldAutorun = searchParams.get("autorun") === "1";
    if (!shouldAutorun || autoRanRef.current || running || hydratingContext) return;

    const hasEnough =
      goal.trim() ||
      customerQuery.trim() ||
      plateOrVin.trim() ||
      workOrderId.trim() ||
      bookingId.trim();

    if (!hasEnough) return;

    autoRanRef.current = true;
    void start();
  }, [
    searchParams,
    running,
    hydratingContext,
    goal,
    customerQuery,
    plateOrVin,
    workOrderId,
    bookingId,
  ]);

  const plannerPresets: PlannerPreset[] = [
    {
      id: "ops",
      label: "General Operations",
      description: "Build an action plan for mixed shop operations.",
    },
    {
      id: "fleet",
      label: "Fleet Follow-up",
      description: "Plan fleet-ready next steps and status follow-up.",
    },
    {
      id: "approvals",
      label: "Resolve Approval Queue",
      description: "Prepare advisor actions for pending approvals.",
    },
    {
      id: "simple",
      label: "Quick Plan",
      description: "Fast structured planning for straightforward requests.",
    },
    {
      id: "openai",
      label: "Deep Plan",
      description: "Use richer planning when the request has extra nuance.",
    },
  ];

  return (
    <PageShell
      title="Planner"
      description="Turn operational goals into reviewable action plans, then confirm and execute."
    >
      <div className="metal-card rounded-3xl p-5 shadow-[var(--theme-shadow-medium)]">
        <div className="flex flex-wrap gap-2">
          {plannerPresets.map((m) => (
            <Button
              key={m.id}
              variant={planner === m.id ? "outline" : "ghost"}
              size="sm"
              className={
                planner === m.id
                  ? "ring-2 ring-orange-400/60 bg-orange-500/10"
                  : "opacity-80 hover:opacity-100"
              }
              onClick={() => setPlanner(m.id)}
              type="button"
            >
              {m.label}
            </Button>
          ))}
        </div>

        <div className="mt-3 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Active planner preset
          </div>
          <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
            {plannerPresets.find((preset) => preset.id === planner)?.description}
          </div>
          {lane ? (
            <div className="mt-2 inline-flex rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
              Operational lane: {LANE_LABEL[lane]}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--theme-text-secondary)]">
            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1">Goal</span>
            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1">Proposed plan</span>
            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1">Affected records</span>
            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1">Review checks</span>
            <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1">Execute / stage</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Advanced settings
            </div>
            <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              Internal planner tuning and safe create behavior.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide" : "Show"}
          </Button>
        </div>

        {showAdvanced ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 shadow-[var(--theme-shadow-medium)]">
            <div className="min-w-[220px]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Data mode
              </div>
              <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">
                {allowCreate
                  ? "Setup mode (allow auto-create)"
                  : "Existing DB mode (no auto-create)"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={allowCreate ? "ghost" : "outline"}
                className={
                  allowCreate
                    ? "opacity-80 hover:opacity-100"
                    : "ring-2 ring-orange-400/60 bg-orange-500/10"
                }
                onClick={() => setAllowCreate(false)}
                disabled={running}
              >
                Existing DB
              </Button>
              <Button
                type="button"
                size="sm"
                variant={allowCreate ? "outline" : "ghost"}
                className={
                  allowCreate
                    ? "ring-2 ring-orange-400/60 bg-orange-500/10"
                    : "opacity-80 hover:opacity-100"
                }
                onClick={() => setAllowCreate(true)}
                disabled={running}
              >
                Setup
              </Button>
            </div>

            {!allowCreate ? (
              <div className="w-full text-xs text-[color:var(--theme-text-secondary)]">
                Existing DB mode is best for history lookups, bookings, status
                questions, and live shop summaries.
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-4 shadow-[var(--theme-shadow-medium)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            What to do here
          </div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--theme-text-primary)]">
            Describe the outcome you want Planner to produce. Planner will return proposed steps, affected records, and checks before execution.
          </div>
        </div>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder='e.g. "Create a work order for this complaint", "Move this booking to tomorrow morning", or "Prepare advisor follow-up for pending approvals"'
          className="mt-3 min-h-[120px] w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-3 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] shadow-[var(--theme-shadow-medium)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
        />

        {(hydratingContext || resolvedCustomerId || resolvedVehicleId) ? (
          <div className="mt-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
            {hydratingContext
              ? "Loading customer and vehicle context…"
              : "Context linked from suggested action / record."}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Customer
            </div>
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] shadow-[var(--theme-shadow-medium)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
              placeholder="e.g. John Smith"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Plate / VIN
            </div>
            <div className="flex gap-2">
              <input
                value={plateOrVin}
                onChange={(e) => setPlateOrVin(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] shadow-[var(--theme-shadow-medium)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                placeholder="e.g. 8ABC123 or 1FT…"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setVinOpen(true)}
                disabled={!userId}
              >
                Scan VIN
              </Button>
            </div>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Email invoice to
            </div>
            <input
              value={emailInvoiceTo}
              onChange={(e) => setEmailInvoiceTo(e.target.value)}
              className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] shadow-[var(--theme-shadow-medium)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
              placeholder="customer@example.com"
              type="email"
              inputMode="email"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Booking ID / Work Order ID
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={bookingId}
                onChange={(e) => setBookingId(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] shadow-[var(--theme-shadow-medium)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                placeholder="Booking ID"
              />
              <input
                value={workOrderId}
                onChange={(e) => setWorkOrderId(e.target.value)}
                className="w-full rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] shadow-[var(--theme-shadow-medium)] focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                placeholder="Work Order ID"
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Photo (DL / Registration)
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[color:var(--theme-text-primary)] file:mr-4 file:rounded-xl file:border file:border-[color:var(--metal-border-soft)] file:bg-[color:var(--theme-surface-inset)] file:px-3 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-[0.18em] file:text-[color:var(--theme-text-primary)] hover:file:bg-[color:var(--theme-surface-overlay)]"
            />
            {photoPreview ? (
              <div className="relative mt-2 h-40 w-full overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft)]">
                <Image
                  src={photoPreview}
                  alt="Preview"
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
            ) : null}
          </label>
        </div>

        {runId ? (
          <div className="mt-4 text-xs text-[color:var(--theme-text-secondary)]">
            Run ID:{" "}
            <code className="rounded bg-[color:var(--theme-surface-inset)] px-2 py-1 text-[11px] text-[color:var(--theme-text-primary)]">
              {runId}
            </code>
          </div>
        ) : null}

        {summary ? (
          <div className="mt-4 rounded-3xl border border-orange-400/20 bg-orange-500/10 p-4 shadow-[var(--theme-shadow-medium)]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
              Proposed plan
            </div>
            <div className="text-sm text-[color:var(--theme-text-primary)]">{summary}</div>
          </div>
        ) : null}

        {proposals.length > 0 ? (
          <div className="mt-4 space-y-4">
            {proposals.map((proposal, index) => (
              (() => {
                const executionResult = executionResults[proposal.id];
                const isDraft = proposal.classification === "draft_only";
                const isConfirmable = proposal.classification === "confirmable_write";
                const canApply =
                  isConfirmable &&
                  proposal.execution_available &&
                  applyConfirmations[proposal.id] === true &&
                  applyingProposalId !== proposal.id;

                return (
              <div
                key={`${proposal.id}-${proposal.lane}-${index}`}
                className={`rounded-3xl p-4 shadow-[var(--theme-shadow-medium)] ${
                  isDraft
                    ? "border border-violet-400/30 bg-violet-950/20"
                    : "border border-sky-400/30 bg-sky-950/20"
                }`}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
                  {isDraft ? "Draft proposal" : isConfirmable ? "Review before apply" : "Informational plan"}
                </div>
                <div className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">{proposal.title}</div>
                <div className="mt-2 text-sm text-[color:var(--theme-text-primary)]">{proposal.summary}</div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                      Proposed plan
                    </div>
                    <ul className="mt-2 space-y-1">
                      {proposal.proposed_steps.map((item, itemIdx) => (
                        <li key={`${proposal.id}-step-${itemIdx}`} className="text-sm text-[color:var(--theme-text-primary)]">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                      Source rationale
                    </div>
                    <ul className="mt-2 space-y-1">
                      {proposal.source_rationale.map((item, itemIdx) => (
                        <li key={`${proposal.id}-source-${itemIdx}`} className="text-sm text-[color:var(--theme-text-primary)]">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {proposal.affected_records.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                      Affected records
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {proposal.affected_records.slice(0, 10).map((record) => (
                        <a
                          key={`${record.type}-${record.id}-${record.href}`}
                          href={record.href}
                          className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs text-sky-200"
                        >
                          {record.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                {proposal.warnings.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-200">
                      Warnings / validation checks
                    </div>
                    <ul className="mt-2 space-y-1">
                      {proposal.warnings.map((warning, warningIdx) => (
                        <li key={`${warningIdx}-${warning}`} className="text-sm text-amber-100">
                          • {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {proposal.duplicate_candidates.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-200">
                      Overlap / duplicate candidates
                    </div>
                    <ul className="mt-2 space-y-1">
                      {proposal.duplicate_candidates.map((item, itemIdx) => (
                        <li key={`${proposal.id}-dup-${itemIdx}`} className="text-sm text-rose-100">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {proposal.review_actions.length > 0 ? (
                  <div className="mt-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                      Review actions
                    </div>
                    <ul className="mt-2 space-y-1">
                      {proposal.review_actions.map((action, actionIdx) => (
                        <li key={`${actionIdx}-${action}`} className="text-sm text-[color:var(--theme-text-primary)]">
                          • {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {isConfirmable ? (
                  <div className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">
                      Required confirmation
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-sm text-[color:var(--theme-text-primary)]">
                      <input
                        type="checkbox"
                        checked={Boolean(applyConfirmations[proposal.id])}
                        onChange={(e) =>
                          setApplyConfirmations((prev) => ({
                            ...prev,
                            [proposal.id]: e.target.checked,
                          }))
                        }
                      />
                      I reviewed this plan and want to continue with apply.
                    </label>
                    {proposal.execution_available ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        disabled={!canApply}
                        isLoading={applyingProposalId === proposal.id}
                        onClick={() => void applyProposal(proposal)}
                      >
                        {proposal.execution_label}
                      </Button>
                    ) : (
                      <div className="mt-3 text-sm text-amber-100">
                        {proposal.not_executable_reason ?? "Not yet executable"}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 p-3 text-sm text-violet-100">
                    {proposal.not_executable_reason ?? "Not yet applied"}
                  </div>
                )}

                {executionResult ? (
                  <div className="mt-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">
                      Execution result
                    </div>
                    <div className="mt-2 text-sm text-emerald-100">{executionResult.summary}</div>
                    {executionResult.changed_records.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {executionResult.changed_records.map((record) => (
                          <li key={`${proposal.id}-changed-${record.id}`} className="text-sm text-emerald-50">
                            • {record.label}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {executionResult.result_links.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {executionResult.result_links.map((link, linkIdx) => (
                          <a
                            key={`${proposal.id}-result-${linkIdx}`}
                            href={link.href}
                            className="rounded-full border border-emerald-300/40 px-3 py-1 text-xs text-emerald-100"
                          >
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {executionResult.audit_ref ? (
                      <div className="mt-2 text-xs text-emerald-200/90">
                        Audit reference: {executionResult.audit_ref}
                      </div>
                    ) : null}
                  </div>
                ) : proposal.result_summary ? (
                  <div className="mt-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)]">
                    {proposal.result_summary}
                  </div>
                ) : null}
              </div>
                );
              })()
            ))}
          </div>
        ) : null}

        {notifications.length > 0 ? (
          <div className="mt-4 rounded-3xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4 shadow-[var(--theme-shadow-medium)]">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Affected records & alerts
            </div>
            <div className="space-y-2">
              {notifications.map((item, index) => (
                <div
                  key={`${item.title ?? "alert"}-${index}`}
                  className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
                >
                  <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {item.title ?? "Alert"}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                    {item.message ?? ""}
                  </div>
                  {item.href ? (
                    <div className="mt-2 text-xs text-orange-300">
                      {item.href}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-3xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4 shadow-[var(--theme-shadow-medium)]">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            Review checks & execution log
          </div>
          {steps.length === 0 ? (
            <div className="text-sm text-[color:var(--theme-text-secondary)]">Generate a plan to begin review checks.</div>
          ) : (
            <ul className="space-y-2">
              {steps.map((s, i) => (
                <li key={`${i}-${s}`} className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-orange-400/80" />
                  <span className="text-sm text-[color:var(--theme-text-primary)]">{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <Button
            onClick={start}
            variant="outline"
            size="md"
            isLoading={running}
            disabled={
              running ||
              (!goal.trim() &&
                !customerQuery.trim() &&
                !plateOrVin.trim() &&
                !workOrderId.trim() &&
                !bookingId.trim())
            }
            className="min-w-[140px]"
          >
            Generate Plan
          </Button>

          <Button
            onClick={clearAll}
            variant="ghost"
            size="md"
            disabled={running}
            className="min-w-[140px]"
          >
            Clear
          </Button>
        </div>
      </div>

      {previewWoId ? (
        <div className="mt-6">
          <WorkOrderPreviewTrigger
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          >
            <WorkOrderPreview woId={previewWoId} />
          </WorkOrderPreviewTrigger>
        </div>
      ) : null}

      {userId ? (
        <VinCaptureModal
          userId={userId}
          open={vinOpen}
          onOpenChange={(open: boolean) => setVinOpen(open)}
          onDecoded={(d) => {
            setVehicleDraft({
              vin: d.vin,
              year: d.year ?? null,
              make: d.make ?? null,
              model: d.model ?? null,
              trim: d.trim ?? null,
              engine: d.engine ?? null,
            });
            setPlateOrVin(d.vin);
            setToast("VIN decoded and recalls queued ✅");
            window.setTimeout(() => setToast(null), 4000);

            setCustomerDraft({
              first_name: undefined,
              last_name: undefined,
              email: emailInvoiceTo || undefined,
              phone: undefined,
            });

            router.push("/work-orders/create?source=ai");
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-[color:var(--metal-border-soft)] bg-[color:var(--theme-surface-overlay)] px-4 py-2 shadow-[var(--theme-shadow-medium)]">
          <div className="flex items-center gap-2 text-sm text-[color:var(--theme-text-primary)]">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" />
            {toast}
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
