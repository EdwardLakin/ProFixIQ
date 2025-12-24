// app/menu/item/[id]/page.tsx (FULL FILE REPLACEMENT)
// Menu Item details + edit + delete
// Uses your NEW API route: /api/menu/item/[id]
// Assumes you have your shared UI components available; otherwise it falls back to simple buttons/inputs.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { PartPicker, type PickedPart } from "@parts/components/PartPicker";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"] & {
  labor_hours?: number | null;
};

type MenuItemPartRow = DB["public"]["Tables"]["menu_item_parts"]["Row"] & {
  // new schema additions
  part_id?: string | null;
  shop_id?: string | null;
};

type EditablePart = {
  id?: string;
  name: string;
  quantityStr: string;
  unitCostStr: string;
  part_id: string | null;
};

type PatchBody = {
  item?: {
    name?: string;
    description?: string | null;
    labor_time?: number | null;
    inspection_template_id?: string | null;
    is_active?: boolean;
  };
  parts?: {
    name: string;
    quantity: number;
    unit_cost: number;
    part_id?: string | null;
  }[];
};

function toNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanNumeric(v: string): string {
  if (v === "") return "";
  v = v.replace(/[^\d.]/g, "");
  if (/^\d/.test(v)) v = v.replace(/^0+(?=\d)/, "");
  return v;
}

export default function MenuItemDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [item, setItem] = useState<MenuItemRow | null>(null);
  const [parts, setParts] = useState<EditablePart[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  const [pickerOpenForRow, setPickerOpenForRow] = useState<number | null>(null);

  const partsTotal = useMemo(() => {
    return parts.reduce((sum, p) => sum + toNum(p.quantityStr) * toNum(p.unitCostStr), 0);
  }, [parts]);

  const laborTotal = useMemo(() => {
    const hours = item?.labor_time ?? (item as any)?.labor_hours ?? 0;
    // you don't store labor rate on menu_items (right now), so show only hours here
    return Number.isFinite(hours as number) ? (hours as number) : 0;
  }, [item]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/menu/item/${id}`, { method: "GET" });
      const json = (await res.json()) as
        | { ok: true; item: MenuItemRow; parts: MenuItemPartRow[] }
        | { ok: false; error: string; detail?: string };

      if (!res.ok || !json.ok) {
        toast.error((json as any).detail ?? "Failed to load menu item");
        return;
      }

      setItem(json.item);

      const rows = (json.parts ?? []).map<EditablePart>((p) => ({
        id: p.id,
        name: (p.name ?? "").toString(),
        quantityStr:
          typeof p.quantity === "number" ? String(p.quantity) : p.quantity != null ? String(p.quantity) : "",
        unitCostStr:
          typeof p.unit_cost === "number" ? String(p.unit_cost) : p.unit_cost != null ? String(p.unit_cost) : "",
        part_id: (p as any).part_id ?? null,
      }));

      setParts(rows.length ? rows : [{ name: "", quantityStr: "", unitCostStr: "", part_id: null }]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load menu item");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadTemplates = useCallback(async () => {
    try {
      // templates are shop-scoped by RLS + current_shop_id; your API route sets shop context on GET/PATCH/DELETE,
      // but this page loads templates from the client. If your templates select relies on current_shop_id(),
      // either call an API route for templates or ensure your templates table has a policy that uses shop_id directly.
      const res = await fetch("/api/inspection-templates/list", { method: "GET" });
      if (!res.ok) return;
      const json = (await res.json()) as { ok?: boolean; data?: TemplateRow[] };
      if (Array.isArray(json.data)) setTemplates(json.data);
    } catch {
      // silently ignore; templates optional
    }
  }, []);

  useEffect(() => {
    void load();
    void loadTemplates();
  }, [load, loadTemplates]);

  const setItemField = (field: keyof MenuItemRow, value: any) => {
    setItem((prev) => (prev ? ({ ...prev, [field]: value } as MenuItemRow) : prev));
  };

  const setPartField = (idx: number, field: "name" | "quantityStr" | "unitCostStr", value: string) => {
    setParts((rows) =>
      rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              [field]: field === "name" ? value : cleanNumeric(value),
            }
          : r,
      ),
    );
  };

  const addPartRow = () => {
    setParts((rows) => [...rows, { name: "", quantityStr: "", unitCostStr: "", part_id: null }]);
  };

  const removePartRow = (idx: number) => {
    setParts((rows) => rows.filter((_, i) => i !== idx));
  };

  const handlePickPart =
    (rowIdx: number) =>
    (sel: PickedPart): void => {
      // PartPicker provides part_id, qty, unit_cost
      const qtyFromSel = sel.qty && sel.qty > 0 ? String(sel.qty) : "";
      const unitCostFromSel =
        sel.unit_cost != null && !Number.isNaN(sel.unit_cost) ? String(sel.unit_cost) : "";

      setParts((rows) =>
        rows.map((r, i) =>
          i === rowIdx
            ? {
                ...r,
                part_id: sel.part_id,
                // keep typed name if user wants, otherwise let it remain
                quantityStr: r.quantityStr || qtyFromSel,
                unitCostStr: r.unitCostStr || unitCostFromSel,
              }
            : r,
        ),
      );

      toast.success("Linked part to row");
    };

  const save = async () => {
    if (!id || !item) return;

    if (!String(item.name ?? "").trim()) {
      toast.error("Service name is required");
      return;
    }

    setSaving(true);
    try {
      const body: PatchBody = {
        item: {
          name: String(item.name ?? "").trim(),
          description: (item.description ?? "").trim() ? item.description : null,
          labor_time:
            typeof item.labor_time === "number"
              ? item.labor_time
              : typeof (item as any).labor_hours === "number"
                ? (item as any).labor_hours
                : null,
          inspection_template_id: (item.inspection_template_id as any) ?? null,
          is_active: (item.is_active as any) ?? true,
        },
        parts: parts
          .filter((p) => p.name.trim().length > 0 && toNum(p.quantityStr) > 0)
          .map((p) => ({
            name: p.name.trim(),
            quantity: toNum(p.quantityStr),
            unit_cost: toNum(p.unitCostStr),
            part_id: p.part_id ?? null,
          })),
      };

      const res = await fetch(`/api/menu/item/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };

      if (!res.ok || !json.ok) {
        toast.error(json.detail ?? json.error ?? "Failed to save changes");
        return;
      }

      toast.success("Saved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!id) return;
    const ok = confirm("Delete this menu item? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/menu/item/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };

      if (!res.ok || !json.ok) {
        toast.error(json.detail ?? json.error ?? "Failed to delete");
        return;
      }

      toast.success("Deleted");
      router.push("/menu");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center text-sm text-neutral-300">
        Loading…
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-3 p-4">
        <div className="text-sm text-neutral-300">Menu item not found.</div>
        <button
          type="button"
          onClick={() => router.push("/menu")}
          className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 hover:border-orange-500"
        >
          Back to menu
        </button>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 fade-in">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)]"
      />

      {/* header */}
      <section className="metal-card flex flex-col gap-3 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-5 py-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
        <div>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Edit Menu Item
          </h1>
          <p className="mt-1 text-sm text-neutral-400">Update details, linked inspection, and parts.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/menu")}
            className="rounded-full border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:bg-neutral-900"
          >
            Back
          </button>
          <button
            type="button"
            onClick={del}
            disabled={deleting}
            className="rounded-full border border-red-500/60 bg-black/70 px-4 py-2 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-5 py-2 text-sm font-semibold text-neutral-50 hover:border-[color:var(--accent-copper-light,#fed7aa)] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>

      {/* main form */}
      <section className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/65 p-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Service name
            </label>
            <input
              value={(item.name ?? "").toString()}
              onChange={(e) => setItemField("name", e.target.value)}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Description
            </label>
            <textarea
              value={(item.description ?? "").toString()}
              onChange={(e) => setItemField("description", e.target.value)}
              className="min-h-[90px] w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Labor time (hrs)
            </label>
            <input
              value={
                typeof item.labor_time === "number"
                  ? String(item.labor_time)
                  : typeof (item as any).labor_hours === "number"
                    ? String((item as any).labor_hours)
                    : ""
              }
              onChange={(e) => setItemField("labor_time", toNum(cleanNumeric(e.target.value)) || null)}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Active
            </label>
            <select
              value={item.is_active ? "yes" : "no"}
              onChange={(e) => setItemField("is_active", e.target.value === "yes")}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 backdrop-blur-md"
            >
              <option value="yes">Active</option>
              <option value="no">Inactive</option>
            </select>
          </div>

          {/* template */}
          <div className="grid gap-2 md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Inspection template (optional)
            </label>
            <select
              value={(item.inspection_template_id ?? "").toString()}
              onChange={(e) => setItemField("inspection_template_id", e.target.value || null)}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 backdrop-blur-md"
            >
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_name ?? "Untitled"}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-500">
              If templates don’t show up, we can switch this dropdown to use a server route that sets shop context.
            </p>
          </div>
        </div>

        {/* parts editor */}
        <div className="mt-6 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-2.5">
            <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">Parts</h3>
            <span className="text-[11px] text-neutral-500">Linked via part_id</span>
          </div>

          <div className="space-y-3 p-4">
            {parts.map((p, idx) => (
              <div
                key={p.id ?? idx}
                className="grid grid-cols-1 items-center gap-2 rounded-xl border border-white/5 bg-black/60 p-3 text-sm shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md md:grid-cols-[2fr_0.8fr_0.8fr_auto_auto]"
              >
                <input
                  placeholder="Part label"
                  value={p.name}
                  onChange={(e) => setPartField(idx, "name", e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                />
                <input
                  placeholder="Qty"
                  inputMode="numeric"
                  value={p.quantityStr}
                  onChange={(e) => setPartField(idx, "quantityStr", e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                />
                <input
                  placeholder="Unit cost"
                  inputMode="decimal"
                  value={p.unitCostStr}
                  onChange={(e) => setPartField(idx, "unitCostStr", e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--metal-border-soft,#1f2937)] bg-transparent px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => setPickerOpenForRow(idx)}
                  className="rounded-lg border border-[color:var(--accent-copper-soft,#fdba74)]/60 px-3 py-2 text-xs font-medium text-neutral-100 hover:bg-[color:var(--accent-copper,#f97316)]/15"
                >
                  Pick
                </button>

                <button
                  type="button"
                  onClick={() => removePartRow(idx)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  ✕
                </button>

                <div className="md:col-span-5">
                  <div className="text-[11px] text-neutral-500">
                    Linked Part:{" "}
                    <span className="font-mono text-neutral-300">
                      {p.part_id ? p.part_id.slice(0, 8) + "…" : "— not linked —"}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addPartRow}
              type="button"
              className="text-xs font-medium text-[color:var(--accent-copper,#f97316)] hover:text-[color:var(--accent-copper-light,#fed7aa)]"
            >
              + Add part
            </button>
          </div>
        </div>

        {/* totals */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm">
            <div className="text-neutral-300">
              Parts: <span className="text-white">${partsTotal.toFixed(2)}</span>
            </div>
            <div className="text-neutral-300">
              Labor hours: <span className="text-white">{laborTotal.toFixed(1)}h</span>
            </div>
          </div>
        </div>
      </section>

      {/* Part picker */}
      {pickerOpenForRow !== null && (
        <PartPicker
          open={true}
          onClose={() => setPickerOpenForRow(null)}
          onPick={(sel) => {
            const idx = pickerOpenForRow;
            setPickerOpenForRow(null);
            handlePickPart(idx)(sel);

            // also auto-fill label from picker if blank:
            setParts((rows) =>
              rows.map((r, i) =>
                i === idx
                  ? {
                      ...r,
                      name: r.name.trim() ? r.name : r.name, // leave as-is; PartPicker doesn't return name in type
                    }
                  : r,
              ),
            );
          }}
        />
      )}
    </div>
  );
}