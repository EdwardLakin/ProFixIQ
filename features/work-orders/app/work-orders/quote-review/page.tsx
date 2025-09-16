"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SignaturePad from "signature_pad";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

export default function QuoteReviewPage() {
  const params = useParams();
  const router = useRouter();
  const woId = useMemo(() => (Array.isArray(params?.id) ? params?.id[0] : (params?.id as string)), [params]);
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [wo, setWo] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [vehicle, setVehicle] = useState<any>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  useEffect(() => {
    if (canvasRef.current) {
      const dpr = window.devicePixelRatio || 1;
      canvasRef.current.width = canvasRef.current.offsetWidth * dpr;
      canvasRef.current.height = 160 * dpr;
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      padRef.current = new SignaturePad(canvasRef.current, { backgroundColor: "rgba(255,255,255,1)" });
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!woId) return;
      const { data: woRow } = await supabase.from("work_orders").select("*").eq("id", woId).maybeSingle();
      setWo(woRow ?? null);
      if (!woRow) return;
      const { data: lineRows } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", woId)
        .order("created_at", { ascending: true });
      setLines(lineRows ?? []);
      if (woRow.vehicle_id) {
        const { data: v } = await supabase.from("vehicles").select("*").eq("id", woRow.vehicle_id).maybeSingle();
        setVehicle(v ?? null);
      }
      if (woRow.customer_id) {
        const { data: c } = await supabase.from("customers").select("*").eq("id", woRow.customer_id).maybeSingle();
        setCustomer(c ?? null);
      }
    })();
  }, [supabase, woId]);

  const subtotal = (lines ?? []).reduce((sum, l) => sum + (typeof l.labor_time === "number" ? l.labor_time : 0) * 100, 0);
  // ^ replace with real pricing math later. For now each hr = $100.

  async function approve() {
    if (!padRef.current || padRef.current.isEmpty()) {
      setErr("Please sign to approve.");
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const dataUrl = padRef.current.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const key = `wo/${woId}/${Date.now()}.png`;
      const up = await supabase.storage.from("signatures").upload(key, blob, { contentType: "image/png" });
      if (up.error) throw up.error;

      const { data: auth } = await supabase.auth.getUser();

      const { error: insErr } = await supabase.from("work_order_approvals").insert({
        work_order_id: woId,
        signature_path: key,
        signed_by: customer?.email || customer?.first_name || null,
        total: subtotal,
        created_by: auth.user?.id ?? null,
      });
      if (insErr) throw insErr;

      const { error: stErr } = await supabase.from("work_orders").update({ status: "awaiting_approval" }).eq("id", woId);
      if (stErr) throw stErr;

      router.push(`/work-orders/${woId}`);
    } catch (e: any) {
      setErr(e?.message || "Failed to approve.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6 text-white">
      <h1 className="text-2xl font-bold">Review & Sign</h1>
      <div className="mt-4 rounded border border-neutral-800 bg-neutral-900 p-4">
        <div className="text-sm text-neutral-300">
          <div><b>Customer:</b> {[customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "—"}</div>
          <div><b>Vehicle:</b> {[vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "—"}</div>
          <div><b>Work Order:</b> {wo?.custom_id || woId}</div>
        </div>

        <h2 className="mt-4 mb-2 text-lg font-semibold">Quote</h2>
        <ul className="divide-y divide-neutral-800">
          {(lines ?? []).map((l) => (
            <li key={l.id} className="py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="truncate">{l.description || l.complaint || "Job"}</div>
                  <div className="text-xs text-neutral-400">
                    {String(l.job_type ?? "job")} • {typeof l.labor_time === "number" ? `${l.labor_time}h` : "—"}
                  </div>
                </div>
                <div className="text-sm">
                  ${typeof l.labor_time === "number" ? (l.labor_time * 100).toFixed(2) : "0.00"}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 text-right text-lg font-semibold">
          Subtotal: ${subtotal.toFixed(2)}
        </div>

        <h3 className="mt-6 mb-1 font-semibold">Customer Signature</h3>
        <div className="rounded border border-neutral-700 bg-white p-2">
          <canvas ref={canvasRef} style={{ width: "100%", height: 160 }} />
        </div>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => padRef.current?.clear()}
            className="rounded border border-neutral-700 px-3 py-2 hover:border-orange-500"
          >
            Clear
          </button>
          <button
            onClick={approve}
            disabled={busy}
            className="rounded bg-orange-500 px-3 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Approve & Sign"}
          </button>
        </div>

        {err && <div className="mt-3 text-red-400">{err}</div>}
      </div>
    </div>
  );
}