// features/work-orders/app/work-orders/editor/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MenuItem = DB["public"]["Tables"]["menu_items"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];

type LineDraft = {
  complaint: string;
  cause?: string;
  correction?: string;
  labor_time?: number;
  tools?: string;
  status?:
    | "unassigned"
    | "assigned"
    | "awaiting"
    | "in_progress"
    | "on_hold"
    | "completed";
  hold_reason?: "parts" | "authorization" | "diagnosis_pending" | "other" | "";
  job_type?: "maintenance" | "diagnosis" | "inspection";
};

export default function WorkOrderEditorPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<MenuItem[]>([]);

  // drafts composed in the editor
  const [lines, setLines] = useState<LineDraft[]>([
    { complaint: "", status: "awaiting", job_type: "maintenance" },
  ]);

  // pick a work order to save into
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWOId, setSelectedWOId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [ok, setOk] = useState<string>("");

  // Load recent WOs for the user’s shop + menu items for the user
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      // Pull recent WOs for the user’s shop
      const { data: prof } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      if (prof?.shop_id) {
        const since = new Date();
        since.setDate(since.getDate() - 60);

        const { data: wos } = await supabase
          .from("work_orders")
          .select("*")
          .eq("shop_id", prof.shop_id)
          .gte("created_at", since.toISOString())
          .order("created_at", { ascending: false });

        setWorkOrders(wos ?? []);
      }

      // User’s menu items
      const { data: items } = await supabase
        .from("menu_items")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setMenuItems(items ?? []);
    })();
  }, [supabase]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length > 1) {
      setFiltered(
        menuItems.filter((mi) =>
          (mi.name ?? mi.complaint ?? "").toLowerCase().includes(q),
        ),
      );
    } else {
      setFiltered([]);
    }
  }, [query, menuItems]);

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  function addEmptyLine() {
    setLines((prev) => [
      ...prev,
      { complaint: "", status: "awaiting", job_type: "maintenance" },
    ]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addFromMenu(mi: MenuItem) {
    setLines((prev) => [
      ...prev,
      {
        complaint: mi.complaint ?? mi.name ?? "",
        cause: mi.cause ?? undefined,
        correction: mi.correction ?? undefined,
        labor_time: mi.labor_time ?? undefined,
        tools: mi.tools ?? undefined,
        status: "awaiting",
        job_type: "maintenance",
      },
    ]);
    setQuery("");
    setFiltered([]);
  }

  async function saveToWorkOrder() {
    setError("");
    setOk("");

    if (!selectedWOId) {
      setError("Please select a work order to save into.");
      return;
    }

    // fetch the WO to pick up vehicle_id
    const { data: wo } = await supabase
      .from("work_orders")
      .select("id, vehicle_id")
      .eq("id", selectedWOId)
      .maybeSingle();

    if (!wo) {
      setError("Selected work order not found.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? null;

    const payload = lines
      .filter((l) => (l.complaint || l.correction || l.cause || l.tools || l.labor_time))
      .map((l) => ({
        work_order_id: wo.id,
        vehicle_id: wo.vehicle_id ?? null,
        user_id: userId,
        complaint: l.complaint || null,
        cause: l.cause || null,
        correction: l.correction || null,
        tools: l.tools || null,
        labor_time: typeof l.labor_time === "number" ? l.labor_time : null,
        status: (l.status ?? "awaiting") as DB["public"]["Tables"]["work_order_lines"]["Row"]["status"],
        hold_reason: (l.hold_reason ?? null) as DB["public"]["Tables"]["work_order_lines"]["Row"]["hold_reason"],
        job_type: (l.job_type ?? null) as DB["public"]["Tables"]["work_order_lines"]["Row"]["job_type"],
      }));

    if (payload.length === 0) {
      setError("Add at least one non-empty line.");
      return;
    }

    setSaving(true);
    const { error: insErr } = await supabase.from("work_order_lines").insert(payload);
    setSaving(false);

    if (insErr) {
      setError(insErr.message);
      return;
    }
    setOk(`Saved ${payload.length} line(s) to WO ${selectedWOId.slice(0, 8)}.`);
  }

  return (
    <div className="mx-auto max-w-4xl p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Work Order Editor</h1>

      {/* Pick a target WO */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 mb-6">
        <label className="block text-sm text-neutral-300 mb-1">Save to Work Order</label>
        <select
          value={selectedWOId}
          onChange={(e) => setSelectedWOId(e.target.value)}
          className="w-full rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
        >
          <option value="">— Select a recent Work Order —</option>
          {workOrders.map((wo) => (
            <option key={wo.id} value={wo.id}>
              {wo.id.slice(0, 8)} • {wo.type ?? "wo"} • {new Date(wo.created_at!).toLocaleString()}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-neutral-400">
          Tip: Create a new work order first from “Create Work Order”, then compose lines here and save into it.
        </p>
      </div>

      {/* Quick menu suggestions */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 mb-6">
        <label className="block text-sm text-neutral-300 mb-1">Quick Add from Menu</label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your saved menu items"
          className="w-full rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
        />
        {filtered.length > 0 && (
          <ul className="mt-2 max-h-48 overflow-auto rounded border border-neutral-800 bg-neutral-950">
            {filtered.map((mi) => (
              <li
                key={mi.id}
                className="px-3 py-2 text-sm hover:bg-neutral-800 cursor-pointer"
                onClick={() => addFromMenu(mi)}
              >
                {(mi.name ?? mi.complaint ?? "Untitled")}{" "}
                {typeof mi.labor_time === "number" ? `• ${mi.labor_time}h` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Line editor */}
      <div className="space-y-4">
        {lines.map((ln, idx) => (
          <div key={idx} className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={ln.complaint}
                onChange={(e) => updateLine(idx, { complaint: e.target.value })}
                placeholder="Complaint"
                className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
              />
              <input
                value={ln.cause ?? ""}
                onChange={(e) => updateLine(idx, { cause: e.target.value })}
                placeholder="Cause"
                className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
              />
              <input
                value={ln.correction ?? ""}
                onChange={(e) => updateLine(idx, { correction: e.target.value })}
                placeholder="Correction"
                className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
              />
              <input
                value={ln.tools ?? ""}
                onChange={(e) => updateLine(idx, { tools: e.target.value })}
                placeholder="Tools"
                className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
              />
              <input
                inputMode="decimal"
                value={ln.labor_time ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateLine(idx, { labor_time: v === "" ? undefined : Number(v) });
                }}
                placeholder="Labor time (hrs)"
                className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
              />
              <select
                value={ln.job_type ?? "maintenance"}
                onChange={(e) => updateLine(idx, { job_type: e.target.value as LineDraft["job_type"] })}
                className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
              >
                <option value="maintenance">Maintenance</option>
                <option value="diagnosis">Diagnosis</option>
                <option value="inspection">Inspection</option>
              </select>
              <select
                value={ln.status ?? "awaiting"}
                onChange={(e) =>
                  updateLine(idx, { status: e.target.value as NonNullable<LineDraft["status"]> })
                }
                className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
              >
                <option value="unassigned">Unassigned</option>
                <option value="assigned">Assigned</option>
                <option value="awaiting">Awaiting</option>
                <option value="in_progress">In Progress</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
              {ln.status === "on_hold" && (
                <select
                  value={ln.hold_reason ?? ""}
                  onChange={(e) =>
                    updateLine(idx, {
                      hold_reason: (e.target.value || undefined) as LineDraft["hold_reason"],
                    })
                  }
                  className="rounded bg-neutral-800 border border-neutral-700 p-2 text-white"
                >
                  <option value="">Select hold reason</option>
                  <option value="parts">Parts Hold</option>
                  <option value="authorization">Awaiting Authorization</option>
                  <option value="diagnosis_pending">Waiting Diagnosis</option>
                  <option value="other">Other</option>
                </select>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => removeLine(idx)}
                className="text-sm text-red-400 hover:underline"
              >
                Remove line
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addEmptyLine}
          className="rounded bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-700"
        >
          + Add another line
        </button>
      </div>

      {/* Save */}
      <div className="mt-6">
        {error && <div className="mb-2 rounded bg-red-100 px-3 py-2 text-red-700">{error}</div>}
        {ok && <div className="mb-2 rounded bg-green-100 px-3 py-2 text-green-800">{ok}</div>}

        <button
          onClick={saveToWorkOrder}
          disabled={saving}
          className="rounded bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-600 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save lines to selected Work Order"}
        </button>
      </div>
    </div>
  );
}