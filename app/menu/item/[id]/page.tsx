// app/menu/item/[id]/page.tsx (FULL FILE REPLACEMENT)
// Menu Item details + edit + delete (NO `any`)
// Uses API route: /api/menu/item/[id]
// Maintains the same "metal-card" theme used on /menu
//
// IMPORTANT:
// - Labor rate is pulled from shops.labor_rate (no manual labor rate input)
// - Menu totals are previewed client-side, but stored totals are computed server-side on save.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import { PartPicker, type PickedPart } from "@parts/components/PartPicker";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type MenuItemPartRow = DB["public"]["Tables"]["menu_item_parts"]["Row"];
type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"] & {
  labor_hours?: number | null;
};

type EditablePart = {
  id?: string;
  name: string;
  quantityStr: string;
  unitCostStr: string;
  part_id: string | null;
};

type EditItemState = {
  name: string;
  description: string;
  laborTimeStr: string;
  inspectionTemplateId: string; // "" when none
  isActive: boolean;
};

type ApiGetResponse =
  | { ok: true; item: MenuItemRow; parts: MenuItemPartRow[] }
  | { ok?: false; error?: string; detail?: string };

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

type ApiBasicResponse = { ok?: boolean; error?: string; detail?: string };

function toNum(raw: string): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function cleanNumericString(raw: string): string {
  if (raw === "") return "";
  const v = raw.replace(/[^\d.]/g, "");
  return v === "" ? "" : v.replace(/^0+(?=\d)/, "");
}

function money(n: number | null | undefined): string {
  const x = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return `$${x.toFixed(2)}`;
}

export default function MenuItemDetailPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const id = params?.id ?? "";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [rawItem, setRawItem] = useState<MenuItemRow | null>(null);
  const [item, setItem] = useState<EditItemState | null>(null);

  const [parts, setParts] = useState<EditablePart[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [shopLaborRate, setShopLaborRate] = useState<number>(0);

  const [pickerOpenForRow, setPickerOpenForRow] = useState<number | null>(null);

  const shopId = useMemo(() => {
    const v = rawItem?.shop_id;
    return typeof v === "string" && v.length ? v : null;
  }, [rawItem]);

  const partsTotal = useMemo(() => {
    return parts.reduce((sum, p) => sum + toNum(p.quantityStr) * toNum(p.unitCostStr), 0);
  }, [parts]);

  const laborHours = useMemo(() => {
    if (!item) return 0;
    return item.laborTimeStr.trim() ? toNum(item.laborTimeStr) : 0;
  }, [item]);

  const laborPreview = useMemo(() => laborHours * shopLaborRate, [laborHours, shopLaborRate]);

  const totalPreview = useMemo(() => partsTotal + laborPreview, [partsTotal, laborPreview]);

  const loadShopMeta = useCallback(
    async (sid: string | null) => {
      if (!sid) {
        setShopLaborRate(0);
        return;
      }

      // If your RLS relies on current_shop_id(), set it client-side too.
      const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: sid });
      if (ctxErr) {
        setShopLaborRate(0);
        return;
      }

      const { data, error } = await supabase
        .from("shops")
        .select("labor_rate")
        .eq("id", sid)
        .maybeSingle<Pick<ShopRow, "labor_rate">>();

      if (error) {
        setShopLaborRate(0);
        return;
      }

      const r =
        typeof data?.labor_rate === "number" && Number.isFinite(data.labor_rate) ? data.labor_rate : 0;

      setShopLaborRate(r);
    },
    [supabase],
  );

  const loadTemplatesForShop = useCallback(
    async (sid: string | null) => {
      if (!sid) {
        setTemplates([]);
        return;
      }

      const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: sid });
      if (ctxErr) {
        setTemplates([]);
        return;
      }

      const { data, error } = await supabase
        .from("inspection_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setTemplates([]);
        return;
      }

      setTemplates((data ?? []) as TemplateRow[]);
    },
    [supabase],
  );

  const load = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/menu/item/${id}`, { method: "GET" });
      const json = (await res.json()) as ApiGetResponse;

      if (!res.ok || !("ok" in json) || !json.ok) {
        toast.error(
          ("detail" in json && json.detail) ||
            ("error" in json && json.error) ||
            "Failed to load item.",
        );
        setRawItem(null);
        setItem(null);
        setParts([]);
        setTemplates([]);
        setShopLaborRate(0);
        return;
      }

      const loadedItem = json.item;
      setRawItem(loadedItem);

      setItem({
        name: typeof loadedItem.name === "string" ? loadedItem.name : String(loadedItem.name ?? ""),
        description:
          typeof loadedItem.description === "string"
            ? loadedItem.description
            : String(loadedItem.description ?? ""),
        laborTimeStr:
          typeof loadedItem.labor_time === "number" && Number.isFinite(loadedItem.labor_time)
            ? String(loadedItem.labor_time)
            : "",
        inspectionTemplateId:
          typeof loadedItem.inspection_template_id === "string"
            ? loadedItem.inspection_template_id
            : "",
        isActive: loadedItem.is_active ?? true,
      });

      const mappedParts: EditablePart[] = (json.parts ?? []).map((p) => ({
        id: p.id,
        name: typeof p.name === "string" ? p.name : String(p.name ?? ""),
        quantityStr:
          typeof p.quantity === "number" && Number.isFinite(p.quantity)
            ? String(p.quantity)
            : p.quantity != null
              ? String(p.quantity)
              : "",
        unitCostStr:
          typeof p.unit_cost === "number" && Number.isFinite(p.unit_cost)
            ? String(p.unit_cost)
            : p.unit_cost != null
              ? String(p.unit_cost)
              : "",
        part_id: typeof p.part_id === "string" && p.part_id.length ? p.part_id : null,
      }));

      setParts(
        mappedParts.length
          ? mappedParts
          : [{ name: "", quantityStr: "", unitCostStr: "", part_id: null }],
      );

      const sid = typeof loadedItem.shop_id === "string" ? loadedItem.shop_id : null;
      await Promise.all([loadTemplatesForShop(sid), loadShopMeta(sid)]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load menu item");
      setRawItem(null);
      setItem(null);
      setParts([]);
      setTemplates([]);
      setShopLaborRate(0);
    } finally {
      setLoading(false);
    }
  }, [id, loadTemplatesForShop, loadShopMeta]);

  useEffect(() => {
    void load();
  }, [load]);

  const setItemField = useCallback(
    <K extends keyof EditItemState>(field: K, value: EditItemState[K]) => {
      setItem((prev) => (prev ? { ...prev, [field]: value } : prev));
    },
    [],
  );

  const setPartField = useCallback(
    (idx: number, field: "name" | "quantityStr" | "unitCostStr", value: string) => {
      setParts((rows) =>
        rows.map((r, i) =>
          i === idx ? { ...r, [field]: field === "name" ? value : cleanNumericString(value) } : r,
        ),
      );
    },
    [],
  );

  const addPartRow = useCallback(() => {
    setParts((rows) => [...rows, { name: "", quantityStr: "", unitCostStr: "", part_id: null }]);
  }, []);

  const removePartRow = useCallback((idx: number) => {
    setParts((rows) => rows.filter((_, i) => i !== idx));
  }, []);

  const handlePickPart =
    (rowIdx: number) =>
    async (sel: PickedPart): Promise<void> => {
      const { data, error } = await supabase
        .from("parts")
        .select("name, unit_cost")
        .eq("id", sel.part_id)
        .maybeSingle();

      const label = !error && data?.name ? data.name : "Part";
      const qtyFromSel = sel.qty && sel.qty > 0 ? String(sel.qty) : "";
      const unitCostFromSel =
        sel.unit_cost != null && Number.isFinite(sel.unit_cost)
          ? String(sel.unit_cost)
          : !error && data?.unit_cost != null
            ? String(data.unit_cost)
            : "";

      setParts((rows) =>
        rows.map((r, i) =>
          i === rowIdx
            ? {
                ...r,
                part_id: sel.part_id,
                name: r.name.trim() ? r.name : label,
                quantityStr: r.quantityStr || qtyFromSel,
                unitCostStr: r.unitCostStr || unitCostFromSel,
              }
            : r,
        ),
      );

      toast.success(`Picked ${label}`);
    };

  const save = useCallback(async () => {
    if (!id || !item) return;

    if (!item.name.trim()) {
      toast.error("Service name is required");
      return;
    }

    setBusy(true);
    try {
      const body: PatchBody = {
        item: {
          name: item.name.trim(),
          description: item.description.trim() ? item.description.trim() : null,
          labor_time: item.laborTimeStr.trim() ? toNum(item.laborTimeStr) : null,
          inspection_template_id: item.inspectionTemplateId.trim() ? item.inspectionTemplateId.trim() : null,
          is_active: item.isActive,
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

      const json = (await res.json()) as ApiBasicResponse;

      if (!res.ok || !json.ok) {
        toast.error(json.detail || json.error || "Failed to save changes");
        return;
      }

      toast.success("Saved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, [id, item, parts, load]);

  const del = useCallback(async () => {
    if (!id) return;

    const ok = confirm("Delete this menu item? This cannot be undone.");
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/menu/item/${id}`, { method: "DELETE" });
      const json = (await res.json()) as ApiBasicResponse;

      if (!res.ok || !json.ok) {
        toast.error(json.detail || json.error || "Failed to delete");
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
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center text-sm text-neutral-300">
        Loading…
      </div>
    );
  }

  if (!rawItem || !item) {
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
          <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-blackops), system-ui" }}>
            Edit Menu Item
          </h1>
          <p className="mt-1 text-sm text-neutral-400">Update details, linked inspection, and parts.</p>

          {shopId ? (
            <p className="mt-1 text-[11px] text-neutral-500">
              Labor rate (shop):{" "}
              <span className="font-medium text-neutral-200">{money(shopLaborRate)}</span>
              <span className="text-neutral-500"> / hr</span>
            </p>
          ) : null}
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
            disabled={busy}
            className="rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-5 py-2 text-sm font-semibold text-neutral-50 hover:border-[color:var(--accent-copper-light,#fed7aa)] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
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
              value={item.name}
              onChange={(e) => setItemField("name", e.target.value)}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Description
            </label>
            <textarea
              value={item.description}
              onChange={(e) => setItemField("description", e.target.value)}
              className="min-h-[90px] w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Labor time (hrs)
            </label>
            <input
              value={item.laborTimeStr}
              onChange={(e) => setItemField("laborTimeStr", cleanNumericString(e.target.value))}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Active
            </label>
            <select
              value={item.isActive ? "yes" : "no"}
              onChange={(e) => setItemField("isActive", e.target.value === "yes")}
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
              value={item.inspectionTemplateId}
              onChange={(e) => setItemField("inspectionTemplateId", e.target.value)}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 backdrop-blur-md"
            >
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_name ?? "Untitled"}
                  {typeof t.labor_hours === "number" ? ` (${t.labor_hours.toFixed(1)}h)` : ""}
                </option>
              ))}
            </select>

            <p className="text-[11px] text-neutral-500">
              If templates are blocked by RLS, we can switch this to a server-fed endpoint.
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
                key={p.id ?? `${idx}`}
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
                      {p.part_id ? `${p.part_id.slice(0, 8)}…` : "— not linked —"}
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
        <div className="mt-5 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm">
            <div className="text-neutral-300">
              Parts: <span className="text-white">{money(partsTotal)}</span>
            </div>
            <div className="text-neutral-300">
              Labor:{" "}
              <span className="text-white">
                {laborHours.toFixed(1)}h × {money(shopLaborRate)}/hr = {money(laborPreview)}
              </span>
            </div>
            <div className="text-neutral-300">
              Preview total:{" "}
              <span className="font-semibold text-[color:var(--accent-copper,#f97316)]">
                {money(totalPreview)}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-neutral-500">
            Saved (server) totals:{" "}
            <span className="text-neutral-200">
              parts {money(rawItem.part_cost)} • total {money(rawItem.total_price)}
            </span>
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
            void handlePickPart(idx)(sel);
          }}
        />
      )}
    </div>
  );
}