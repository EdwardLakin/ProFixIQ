// app/menu/page.tsx (FULL FILE REPLACEMENT)
// Menu list routes to: /menu/item/[id]
// NO `any` casts.

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";
import { toast } from "sonner";

import { PartPicker, type PickedPart } from "@parts/components/PartPicker";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";

type DB = Database;

type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"] & {
  labor_hours?: number | null;
};

type PartFormRow = {
  name: string;
  quantityStr: string;
  unitCostStr: string;
  part_id?: string | null;
};

type FormState = {
  source: "master" | "manual";
  name: string;
  description: string;
  laborTimeStr: string;
  laborRateStr: string;
  inspectionTemplateId: string;
};

function toNum(s: string): number {
  const n = parseFloat(s);
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

function getShopIdFromUser(user: unknown): string | null {
  if (!user || typeof user !== "object") return null;
  const rec = user as Record<string, unknown>;
  const v = rec["shop_id"];
  return typeof v === "string" && v.length ? v : null;
}

export default function MenuItemsPage() {
  const supabase = createClientComponentClient<DB>();
  const router = useRouter();
  const { user, isLoading } = useUser();

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [saving, setSaving] = useState(false);

  // create form
  const [pickerOpenForRow, setPickerOpenForRow] = useState<number | null>(null);
  const [parts, setParts] = useState<PartFormRow[]>([
    { name: "", quantityStr: "", unitCostStr: "", part_id: null },
  ]);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [form, setForm] = useState<FormState>({
    source: "master",
    name: "",
    description: "",
    laborTimeStr: "",
    laborRateStr: "",
    inspectionTemplateId: "",
  });

  const partsTotal = useMemo(
    () =>
      parts.reduce((sum, p) => {
        const q = toNum(p.quantityStr);
        const u = toNum(p.unitCostStr);
        return sum + q * u;
      }, 0),
    [parts],
  );

  const laborTotal = useMemo(
    () => toNum(form.laborTimeStr) * toNum(form.laborRateStr),
    [form.laborTimeStr, form.laborRateStr],
  );

  const grandTotal = useMemo(() => partsTotal + laborTotal, [partsTotal, laborTotal]);

  // ---------------------------
  // LIST + REALTIME
  // ---------------------------
  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("Failed to fetch menu items:", error);
      toast.error("Could not load menu items");
      return;
    }

    setMenuItems(data ?? []);
  }, [supabase]);

  const fetchTemplates = useCallback(async () => {
    const { data: me } = await supabase.auth.getUser();
    const uid = me?.user?.id ?? null;

    const minePromise = uid
      ? supabase
          .from("inspection_templates")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as TemplateRow[], error: null });

    const sharedPromise = supabase
      .from("inspection_templates")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false });

    const [{ data: mineRaw }, { data: sharedRaw }] = await Promise.all([
      minePromise,
      sharedPromise,
    ]);

    setTemplates([
      ...(Array.isArray(mineRaw) ? (mineRaw as TemplateRow[]) : []),
      ...(Array.isArray(sharedRaw) ? (sharedRaw as TemplateRow[]) : []),
    ]);
  }, [supabase]);

  useEffect(() => {
    void fetchItems();
    void fetchTemplates();

    const channel = supabase
      .channel("menu-items-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, () =>
        void fetchItems(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchItems, fetchTemplates]);

  // ---------------------------
  // PARTS EDITOR HELPERS
  // ---------------------------
  const setPartField = (
    idx: number,
    field: "name" | "quantityStr" | "unitCostStr",
    value: string,
  ) => {
    setParts((rows) =>
      rows.map((r, i) =>
        i === idx
          ? { ...r, [field]: field === "name" ? value : cleanNumericString(value) }
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
      (async () => {
        const { data } = await supabase
          .from("parts")
          .select("name, unit_cost")
          .eq("id", sel.part_id)
          .maybeSingle();

        const label = data?.name ?? "Part";
        const qtyFromSel = sel.qty && sel.qty > 0 ? String(sel.qty) : "";
        const unitCostFromSel =
          sel.unit_cost != null && !Number.isNaN(sel.unit_cost)
            ? String(sel.unit_cost)
            : data?.unit_cost != null
              ? String(data.unit_cost)
              : "";

        setParts((rows) =>
          rows.map((r, i) =>
            i === rowIdx
              ? {
                  ...r,
                  part_id: sel.part_id,
                  name: label,
                  quantityStr: r.quantityStr || qtyFromSel,
                  unitCostStr: r.unitCostStr || unitCostFromSel,
                }
              : r,
          ),
        );

        toast.success(`Picked ${label}`);
      })().catch(() => {
        setParts((rows) =>
          rows.map((r, i) => (i === rowIdx ? { ...r, part_id: sel.part_id } : r)),
        );
      });
    };

  // ---------------------------
  // CREATE (POST /api/menu/save)
  // ---------------------------
  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error("Service name is required");
      return;
    }

    const shopId = getShopIdFromUser(user);
    if (!shopId) {
      toast.error("Missing shop context (shop_id).");
      return;
    }

    setSaving(true);
    try {
      const cleanedParts = parts
        .filter((p) => p.name.trim().length > 0 && toNum(p.quantityStr) > 0)
        .map((p) => ({
          name: p.name.trim(),
          quantity: toNum(p.quantityStr),
          unit_cost: toNum(p.unitCostStr),
          part_id: p.part_id ?? null,
        }));

      const payload = {
        item: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          labor_time: form.laborTimeStr.trim() ? toNum(form.laborTimeStr) : null,
          part_cost: partsTotal,
          total_price: grandTotal,
          inspection_template_id: form.inspectionTemplateId || null,
          shop_id: shopId,
        },
        parts: cleanedParts,
      };

      const res = await fetch("/api/menu/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string; detail?: string };

      if (!res.ok || !json.ok) {
        toast.error(json.detail || json.error || "Failed to save menu item.");
        return;
      }

      toast.success("Menu item created");

      setForm((f) => ({
        ...f,
        name: "",
        description: "",
        laborTimeStr: "",
        laborRateStr: "",
        inspectionTemplateId: "",
      }));
      setParts([{ name: "", quantityStr: "", unitCostStr: "", part_id: null }]);

      await fetchItems();
    } catch (err) {
      console.error("[menu] unexpected save error", err);
      toast.error("Could not save menu item.");
    } finally {
      setSaving(false);
    }
  }, [form, parts, partsTotal, grandTotal, user, fetchItems]);

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-neutral-300">
        Loading…
      </div>
    );
  }

  const flatMaster = masterServicesList.flatMap((cat) => cat.items.map((i) => i.item));

  return (
    <div className="relative space-y-8 fade-in">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.95),#020617_70%)]"
      />

      {/* Header */}
      <section className="metal-card mb-2 flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-gradient-to-r from-black/85 via-slate-950/95 to-black/85 px-5 py-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl">
        <div>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Service Menu
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            Build reusable service packages with linked inspections, labor, and parts.
          </p>
        </div>
      </section>

      {/* Create */}
      <section className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/65 p-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
            Create menu item
          </h2>
          <div className="rounded-full border border-[color:var(--accent-copper,#f97316)]/50 bg-black/70 px-3 py-1 text-[11px] text-neutral-300">
            Parts + labor + inspection template
          </div>
        </div>

        <div className="mb-8 grid max-w-3xl gap-4">
          {/* name */}
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Service name
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={form.source}
                onChange={(e) =>
                  setForm((f) => ({ ...f, source: e.target.value as "master" | "manual" }))
                }
                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] backdrop-blur-md sm:w-44"
              >
                <option value="master">From master list</option>
                <option value="manual">Manual</option>
              </select>
              <div className="flex-1">
                <input
                  placeholder="e.g. Front brake pads & rotors"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  list={form.source === "master" ? "master-services" : undefined}
                  autoComplete="off"
                  className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
                />
                {form.source === "master" ? (
                  <datalist id="master-services">
                    {flatMaster.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                ) : null}
              </div>
            </div>
          </div>

          {/* template */}
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Inspection template (optional)
            </label>
            <select
              value={form.inspectionTemplateId}
              onChange={(e) => setForm((f) => ({ ...f, inspectionTemplateId: e.target.value }))}
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] backdrop-blur-md"
            >
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.template_name ?? "Untitled"}
                  {typeof t.labor_hours === "number" ? ` (${t.labor_hours.toFixed(1)}h)` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* description */}
          <div className="grid gap-2">
            <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
              Description
            </label>
            <textarea
              placeholder="Optional details visible to customer"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="min-h-[80px] rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
            />
          </div>

          {/* labor */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                Labor time (hrs)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 1.5"
                value={form.laborTimeStr}
                onChange={(e) =>
                  setForm((f) => ({ ...f, laborTimeStr: cleanNumericString(e.target.value) }))
                }
                className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                Labor rate ($/hr)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g. 120"
                value={form.laborRateStr}
                onChange={(e) =>
                  setForm((f) => ({ ...f, laborRateStr: cleanNumericString(e.target.value) }))
                }
                className="rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
              />
            </div>
          </div>

          {/* parts */}
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-2.5">
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                Parts
              </h3>
              <span className="text-[11px] text-neutral-500">Linked to parts catalog</span>
            </div>
            <div className="space-y-3 p-4">
              {parts.map((p, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 items-center gap-2 rounded-xl border border-white/5 bg-black/60 p-3 text-sm shadow-[0_12px_30px_rgba(0,0,0,0.9)] backdrop-blur-md md:grid-cols-[2fr_0.8fr_0.8fr_auto_auto]"
                >
                  <input
                    placeholder="Part name (or pick)"
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

          {/* totals + save */}
          <div className="flex flex-col items-end gap-3 pt-2 text-sm md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-xs md:text-sm">
              <div className="text-neutral-300">
                Parts: <span className="text-white">{money(partsTotal)}</span>
              </div>
              <div className="text-neutral-300">
                Labor: <span className="text-white">{money(laborTotal)}</span>
              </div>
              <div className="text-neutral-300">
                Total:{" "}
                <span className="font-semibold text-[color:var(--accent-copper,#f97316)]">
                  {money(grandTotal)}
                </span>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-6 py-2 text-sm font-semibold text-neutral-50 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-md transition hover:border-[color:var(--accent-copper-light,#fed7aa)] hover:bg-[color:var(--accent-copper,#f97316)]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save menu item"}
            </button>
          </div>
        </div>
      </section>

      {/* Saved items */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
          Saved menu items
        </h2>
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li
              key={item.id}
              className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-3 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-xl"
            >
              <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[color:var(--accent-copper,#f97316)]">
                    {item.name}
                  </div>
                  {item.description ? (
                    <span className="block line-clamp-2 text-xs text-neutral-400">
                      {item.description}
                    </span>
                  ) : null}
                  <div className="mt-1 text-[11px] text-neutral-500">
                    {item.is_active ? "Active" : "Inactive"}
                    {item.labor_time != null ? ` • ${item.labor_time}h` : ""}
                    {item.part_cost != null ? ` • parts ${money(item.part_cost)}` : ""}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs text-neutral-300 md:text-sm">
                    {typeof item.total_price === "number" ? (
                      <span>
                        Total{" "}
                        <span className="font-semibold text-neutral-50">
                          {money(item.total_price)}
                        </span>
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => router.push(`/menu/item/${item.id}`)}
                    className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-100 hover:border-orange-500 hover:bg-neutral-900"
                  >
                    View / Edit
                  </button>
                </div>
              </div>
            </li>
          ))}

          {menuItems.length === 0 && (
            <li className="text-sm text-neutral-400">
              No menu items yet. Create your first service above.
            </li>
          )}
        </ul>
      </section>

      {/* Part picker modal (create form only) */}
      {pickerOpenForRow !== null && (
        <PartPicker
          open={true}
          onClose={() => setPickerOpenForRow(null)}
          onPick={(sel) => {
            const idx = pickerOpenForRow;
            setPickerOpenForRow(null);
            handlePickPart(idx)(sel);
          }}
        />
      )}
    </div>
  );
}