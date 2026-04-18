// features/work-orders/app/work-orders/editor/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";
import { cn } from "@shared/lib/utils";
import { desktopPrimitives as ui } from "@/features/shared/components/ui/desktopPrimitives";

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

const fieldClass = ui.input;

export default function WorkOrderEditorPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<MenuItem[]>([]);

  const [lines, setLines] = useState<LineDraft[]>([
    { complaint: "", status: "awaiting", job_type: "maintenance" },
  ]);

  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWOId, setSelectedWOId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [ok, setOk] = useState<string>("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

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
    <PageShell
      title="Work Order Editor"
      eyebrow="Work Orders"
      description="Compose operational line items, then commit them to an active work order with clear execution ownership."
      actions={
        <Button
          onClick={saveToWorkOrder}
          disabled={saving}
          className={ui.buttonPrimary}
        >
          {saving ? "Saving…" : "Save to selected work order"}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)]">
        <section className={cn(PANEL_VARIANTS.primary, "space-y-4 px-4 py-4 md:px-5 md:py-5")}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--theme-card-border,#334155)] pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted,#64748B)]">
                Primary workflow zone
              </p>
              <h2 className="text-lg font-semibold text-[var(--theme-text-primary,#E2E8F0)]">
                Compose and stage work-order lines
              </h2>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addEmptyLine} className={ui.buttonSecondary}>
              + Add line
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((ln, idx) => (
              <article
                key={idx}
                className={cn(
                  PANEL_VARIANTS.secondary,
                  "space-y-3 px-3 py-3 md:px-4",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-muted,#64748B)]">
                    Line {idx + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="desktop-pill border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-medium normal-case tracking-[0.08em] text-rose-200 hover:border-rose-400/60"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input value={ln.complaint} onChange={(e) => updateLine(idx, { complaint: e.target.value })} placeholder="Complaint" className={fieldClass} />
                  <input value={ln.cause ?? ""} onChange={(e) => updateLine(idx, { cause: e.target.value })} placeholder="Cause" className={fieldClass} />
                  <input value={ln.correction ?? ""} onChange={(e) => updateLine(idx, { correction: e.target.value })} placeholder="Correction" className={fieldClass} />
                  <input value={ln.tools ?? ""} onChange={(e) => updateLine(idx, { tools: e.target.value })} placeholder="Tools" className={fieldClass} />
                  <input
                    inputMode="decimal"
                    value={ln.labor_time ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateLine(idx, { labor_time: v === "" ? undefined : Number(v) });
                    }}
                    placeholder="Labor time (hrs)"
                    className={fieldClass}
                  />
                  <select value={ln.job_type ?? "maintenance"} onChange={(e) => updateLine(idx, { job_type: e.target.value as LineDraft["job_type"] })} className={fieldClass}>
                    <option value="maintenance">Maintenance</option>
                    <option value="diagnosis">Diagnosis</option>
                    <option value="inspection">Inspection</option>
                  </select>
                  <select
                    value={ln.status ?? "awaiting"}
                    onChange={(e) => updateLine(idx, { status: e.target.value as NonNullable<LineDraft["status"]> })}
                    className={fieldClass}
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
                      className={fieldClass}
                    >
                      <option value="">Select hold reason</option>
                      <option value="parts">Parts Hold</option>
                      <option value="authorization">Awaiting Authorization</option>
                      <option value="diagnosis_pending">Waiting Diagnosis</option>
                      <option value="other">Other</option>
                    </select>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className={cn(PANEL_VARIANTS.secondary, "space-y-3 px-4 py-4") }>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted,#64748B)]">
                Secondary context
              </p>
              <h3 className="text-sm font-semibold">Target work order</h3>
            </div>
            <select value={selectedWOId} onChange={(e) => setSelectedWOId(e.target.value)} className={fieldClass}>
              <option value="">— Select a recent Work Order —</option>
              {workOrders.map((wo) => (
                <option key={wo.id} value={wo.id}>
                  {wo.id.slice(0, 8)} • {wo.type ?? "wo"} • {new Date(wo.created_at!).toLocaleString()}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--theme-text-muted,#64748B)]">
              Select one active order, then commit staged lines when ready.
            </p>
          </section>

          <section className={cn(PANEL_VARIANTS.passive, "space-y-3 px-4 py-4") }>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-text-muted,#64748B)]">
                Passive support
              </p>
              <h3 className="text-sm font-semibold">Quick add from menu</h3>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saved menu items"
              className={fieldClass}
            />
            {filtered.length > 0 && (
              <ul className="max-h-56 space-y-1 overflow-auto">
                {filtered.map((mi) => (
                  <li key={mi.id}>
                    <button
                      type="button"
                    className="desktop-panel-soft w-full rounded-md px-2.5 py-2 text-left text-xs text-[var(--theme-text-secondary,#94A3B8)] hover:border-[var(--brand-accent,#E39A6E)]/70"
                      onClick={() => addFromMenu(mi)}
                    >
                      {(mi.name ?? mi.complaint ?? "Untitled")}
                      {typeof mi.labor_time === "number" ? ` • ${mi.labor_time}h` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(error || ok) && (
            <section
              className={cn(
                PANEL_VARIANTS.passive,
                "px-4 py-3 text-sm",
                error ? "border-rose-500/40" : "border-emerald-500/40",
              )}
            >
              {error ? (
                <p className="text-rose-200">{error}</p>
              ) : (
                <p className="text-emerald-200">{ok}</p>
              )}
            </section>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
