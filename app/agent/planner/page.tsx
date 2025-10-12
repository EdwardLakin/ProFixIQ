"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

/* ✅ Planner + OCR + VIN Draft Link-Up */
import { useWorkOrderDraft } from "app/work-orders/state/useWorkOrderDraft";
/* ✅ NEW: two-part preview modal */
import { WorkOrderPreviewTrigger } from "app/work-orders/components/WorkOrderPreviewTrigger";
import {WorkOrderPreview } from "app/work-orders/components/WorkOrderPreview"

type PlannerKind = "simple" | "openai";
type AgentStartOut = { runId: string; alreadyExists: boolean };

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

/** Safe error → string */
function toMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as Error).message;
  }
  try {
    return String(e);
  } catch {
    return "Unknown error";
  }
}

/** Types for agent SSE events (no `any`) */
type AgentEvent = Record<string, unknown> & { kind?: string };

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function extractWorkOrderId(evt: AgentEvent): string | null {
  return (
    asString(evt.work_order_id) ?? // snake_case
    asString(evt.workOrderId) ??   // camelCase
    asString(evt.wo_id) ??         // short
    asString(evt.id)               // generic id
  );
}

export default function PlannerPage() {
  const [goal, setGoal] = useState("");
  const [planner, setPlanner] = useState<PlannerKind>("openai");
  const [customerQuery, setCustomerQuery] = useState("");
  const [plateOrVin, setPlateOrVin] = useState("");
  const [emailInvoiceTo, setEmailInvoiceTo] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [runId, setRunId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // 🎯 NEW: Preview modal state
  const [previewWoId, setPreviewWoId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const supabase = createClientComponentClient<Database>();
  const draft = useWorkOrderDraft();
  const setVehicleDraft = useWorkOrderDraft((s) => s.setVehicle);
  const setCustomerDraft = useWorkOrderDraft((s) => s.setCustomer);

  // ✅ cleanup preview URL & SSE
  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [photoPreview]);

  // ✅ prefill from draft once on mount
  useEffect(() => {
    const v = (draft?.vehicle?.vin ?? "").trim();
    if (v && !plateOrVin) setPlateOrVin(v);
    const em = (draft?.customer?.email ?? "").trim();
    if (em && !emailInvoiceTo) setEmailInvoiceTo(em);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPickPhoto(file: File | null) {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadPhotoIfAny(): Promise<string | undefined> {
    if (!photo) return undefined;
    const path = `agent-uploads/${crypto.randomUUID().replace(/-/g, "")}-${photo.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const up = await supabase.storage.from("agent-uploads").upload(path, photo, {
      cacheControl: "3600",
      upsert: false,
    });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    const pub = supabase.storage.from("agent-uploads").getPublicUrl(path);
    if (!pub.data?.publicUrl) throw new Error("Could not resolve public URL");
    return pub.data.publicUrl;
  }

  function usePresetOilBrake() {
    setGoal("Create a work order and add lines for oil change and brake inspection. Then generate an invoice.");
  }

  async function start() {
    setStatus("Starting…");
    esRef.current?.close();
    esRef.current = null;

    try {
      const imageUrl = await uploadPhotoIfAny();

      // ✅ clear file + preview for next run
      if (imageUrl && photoPreview) URL.revokeObjectURL(photoPreview);
      if (imageUrl) {
        setPhoto(null);
        setPhotoPreview(null);
      }

      /* ✅ D: OCR call if image present */
      let ocrFields: OcrFields | null = null;
      if (imageUrl) {
        setStatus((s) => `${s}${s ? "\n" : ""}[ocr] uploading & parsing…`);
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

            if (!plateOrVin && (f.vin || f.plate)) setPlateOrVin(f.vin || f.plate || "");
            if (!emailInvoiceTo && f.email) setEmailInvoiceTo(f.email || "");

            const compact = Object.fromEntries(Object.entries(f).filter(([, v]) => v && String(v).trim()));
            setStatus((s) => `${s}${s ? "\n" : ""}[ocr] parsed: ${JSON.stringify(compact)}`);
            ocrFields = f;
          } else {
            setStatus((s) => `${s}${s ? "\n" : ""}[ocr] HTTP ${res.status}`);
          }
        } catch (err) {
          setStatus((s) => `${s}${s ? "\n" : ""}[ocr] error: ${toMsg(err)}`);
        }
      }

      /* ✅ C: include VIN/vehicle hints */
      const vinFromDraft = (draft?.vehicle?.vin ?? "").trim() || undefined;
      const decodedVehicle =
        draft?.vehicle &&
        (draft.vehicle.year || draft.vehicle.make || draft.vehicle.model || draft.vehicle.trim || draft.vehicle.engine)
          ? {
              year: draft.vehicle.year ?? null,
              make: draft.vehicle.make ?? null,
              model: draft.vehicle.model ?? null,
              trim: draft.vehicle.trim ?? null,
              engine: draft.vehicle.engine ?? null,
            }
          : undefined;

      const ctx = {
        customerQuery: customerQuery || undefined,
        plateOrVin: plateOrVin || vinFromDraft || undefined,
        emailInvoiceTo: emailInvoiceTo || undefined,
        imageUrl,
        vin: vinFromDraft || (plateOrVin?.length === 17 ? plateOrVin : undefined),
        decodedVehicle,
        ocr: ocrFields || undefined,
      } as Record<string, unknown>;

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          planner,
          context: ctx,
          idempotencyKey: crypto.randomUUID(),
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof j?.error === "string" ? j.error : `HTTP ${res.status}`);
      }

      const out = (await res.json()) as AgentStartOut;
      setRunId(out.runId);
      setStatus((s) => `${s}${s ? "\n" : ""}Run ${out.runId} ${out.alreadyExists ? "(resumed)" : "started"} — streaming…`);

      // ✅ SSE stream
      const url = `/api/agent/events?runId=${encodeURIComponent(out.runId)}`;
      const es = new EventSource(url, { withCredentials: false });
      esRef.current = es;

      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as AgentEvent;

          // ⭐ Auto-open preview when agent signals a created WO
          const maybeId = extractWorkOrderId(data);
          if ((data.kind === "wo.created" || data.kind === "work_order.created") && typeof maybeId === "string") {
            setPreviewWoId(maybeId);
            setPreviewOpen(true);
          }

          const line = data?.kind ? `[${data.kind}] ${JSON.stringify(data)}` : JSON.stringify(data);
          setStatus((s) => (s ? s + "\n" + line : line));
        } catch {
          setStatus((s) => (s ? s + "\n" + ev.data : ev.data));
        }
      };
      es.onerror = () => {
        setStatus((s) => (s ? s + "\n(stream closed)" : "(stream closed)"));
        es.close();
      };
    } catch (e: unknown) {
      setStatus(`Error: ${toMsg(e)}`);
    }
  }

  return (
    <div className="p-6">
      <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-5 space-y-4">
        <h1
          className="text-2xl font-black text-orange-400"
          style={{ fontFamily: "'Black Ops One', system-ui, sans-serif" }}
        >
          AI Planner
        </h1>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-sm text-neutral-400 mb-1">Goal</div>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Find John Smith, create inspection WO, add note, email invoice"
              className="w-full min-h-[96px] p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
            />
            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="sm" onClick={usePresetOilBrake}>
                Use preset: Oil + Brake
              </Button>
            </div>
          </label>

          <div className="grid gap-3">
            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Planner</div>
              <select
                value={planner}
                onChange={(e) => setPlanner((e.target.value as PlannerKind) ?? "openai")}
                className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
              >
                <option value="openai">OpenAI (rich)</option>
                <option value="simple">Simple (rules)</option>
              </select>
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Customer query (name)</div>
              <input
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
                placeholder="e.g. John Smith"
              />
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Plate or VIN</div>
              <input
                value={plateOrVin}
                onChange={(e) => setPlateOrVin(e.target.value)}
                className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
                placeholder="e.g. 8ABC123 or 1FT…"
              />
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Email invoice to (optional)</div>
              <input
                value={emailInvoiceTo}
                onChange={(e) => setEmailInvoiceTo(e.target.value)}
                className="w-full p-2 rounded border border-neutral-800 bg-neutral-900 text-neutral-100"
                placeholder="customer@example.com"
                type="email"
                inputMode="email"
              />
            </label>

            <label className="block">
              <div className="text-sm text-neutral-400 mb-1">Photo (DL / Registration)</div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-neutral-300 file:mr-4 file:py-2 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-orange-600 file:text-white hover:file:bg-orange-700"
              />
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="mt-2 max-h-40 rounded border border-neutral-800 object-contain"
                />
              ) : null}
            </label>
          </div>
        </div>

        <Button
          onClick={start}
          variant="orange"
          size="md"
          isLoading={status?.startsWith("Starting…") === true}
          disabled={!goal.trim()}
          className="font-black"
        >
          Run Plan
        </Button>

        <div className="text-xs text-neutral-500">
          {runId ? <>Run ID: <code>{runId}</code></> : null}
        </div>

        <pre className="whitespace-pre-wrap bg-neutral-900 p-4 rounded text-sm text-neutral-200 border border-neutral-800 min-h-[160px]">
          {status}
        </pre>
      </div>

      {/* 🔶 Preview modal: trigger + server preview (only when we have a new WO) */}
      {previewWoId && (
  <div className="mt-6">
    <WorkOrderPreviewTrigger
      open={previewOpen}
      onOpenChange={setPreviewOpen}
    >
      {/* Server component rendered by the page (allowed) */}
      <WorkOrderPreview woId={previewWoId} />
    </WorkOrderPreviewTrigger>
  </div>
)}
    </div>
  );
}