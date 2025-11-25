// app/menu/page.tsx
"use client";

import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";
import { toast } from "sonner";

import { PartPicker, type PickedPart } from "@parts/components/PartPicker";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";

type DB = Database;

type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type InsertMenuItemPart = DB["public"]["Tables"]["menu_item_parts"]["Insert"];
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

export default function MenuItemsPage() {
  const supabase = createClientComponentClient<DB>();
  const { user, isLoading } = useUser();

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [saving, setSaving] = useState(false);

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

  // --------- tiny numeric helper ----------
  const toNum = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

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

  const grandTotal = useMemo(
    () => partsTotal + laborTotal,
    [partsTotal, laborTotal],
  );

  // --------- fetch menu items (always full list you can see) ----------
  const fetchItems = useCallback(async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Failed to fetch menu items:", error);
      toast.error("Could not load menu items");
      return;
    }

    setMenuItems(data ?? []);
  }, [supabase]);

  // --------- fetch templates ----------
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
      ...(Array.isArray(mineRaw) ? mineRaw : []),
      ...(Array.isArray(sharedRaw) ? sharedRaw : []),
    ]);
  }, [supabase]);

  // --------- bootstrap ----------
  useEffect(() => {
    void fetchItems();
    void fetchTemplates();

    const channel = supabase
      .channel("menu-items-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "menu_items",
        },
        () => {
          void fetchItems();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchItems, fetchTemplates]);

  // --------- parts helpers ----------
  const setPartField = (
    idx: number,
    field: "name" | "quantityStr" | "unitCostStr",
    value: string,
  ) => {
    const cleanNumeric = (v: string) => {
      if (v === "") return "";
      if (/^\d/.test(v)) v = v.replace(/^0+(?=\d)/, "");
      return v;
    };

    setParts((rows) =>
      rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              [field]:
                field === "name"
                  ? value
                  : cleanNumeric(value.replace(/[^\d.]/g, "")),
            }
          : r,
      ),
    );
  };

  const addPartRow = () => {
    setParts((rows) => [
      ...rows,
      { name: "", quantityStr: "", unitCostStr: "", part_id: null },
    ]);
  };

  const removePartRow = (idx: number) => {
    setParts((rows) => rows.filter((_, i) => i !== idx));
  };

  const handlePickPart = (rowIdx: number) => (sel: PickedPart) => {
    (async () => {
      const { data } = await supabase
        .from("parts")
        .select("name, sku")
        .eq("id", sel.part_id)
        .maybeSingle();

      const label = data?.name ?? "Part";
      setParts((rows) =>
        rows.map((r, i) =>
          i === rowIdx
            ? {
                ...r,
                part_id: sel.part_id,
                name: label,
                quantityStr: r.quantityStr || (sel.qty ? String(sel.qty) : ""),
              }
            : r,
        ),
      );

      toast.success(`Added ${label} to row`);
    })().catch(() => {
      setParts((rows) =>
        rows.map((r, i) =>
          i === rowIdx ? { ...r, part_id: sel.part_id } : r,
        ),
      );
    });
  };

  // --------- SAVE (still uses /api/menu/save) ----------
  const handleSubmit = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error("Service name is required");
      return;
    }

    setSaving(true);
    try {
      const cleanedParts: InsertMenuItemPart[] = parts
        .filter(
          (p) => p.name.trim().length > 0 && toNum(p.quantityStr) > 0,
        )
        .map<InsertMenuItemPart>((p) => ({
          menu_item_id: "placeholder",
          name: p.name.trim(),
          quantity: toNum(p.quantityStr),
          unit_cost: toNum(p.unitCostStr),
          user_id: user?.id ?? null,
        }));

      const payload = {
        item: {
          name: form.name.trim(),
          description: form.description.trim() || null,
          labor_time: toNum(form.laborTimeStr),
          labor_hours: null,
          part_cost: partsTotal,
          total_price: grandTotal,
          inspection_template_id: form.inspectionTemplateId || null,
          shop_id:
            (user as unknown as { shop_id?: string | null })?.shop_id ?? null,
        },
        parts: cleanedParts,
      };

      const res = await fetch("/api/menu/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!res.ok || json.error) {
        console.error("[menu] save failed:", json.error);
        toast.error(json.error ?? "Failed to save menu item.");
        return;
      }

      toast.success("Menu item created");

      setForm((f) => ({
        ...f,
        name: "",
        description: "",
        laborTimeStr: "",
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

  if (isLoading) return <div className="p-4 text-white">Loading…</div>;

  const flatMaster = masterServicesList.flatMap((cat) =>
    cat.items.map((i) => i.item),
  );

  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-blackops text-orange-400">
        Menu Items
      </h1>

      {/* form */}
      <div className="mb-8 grid max-w-2xl gap-3">
        {/* Service name (selector + input) */}
        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">Service name</label>
          <div className="flex gap-2">
            <select
              value={form.source}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  source: e.target.value as "master" | "manual",
                }))
              }
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            >
              <option value="master">— from master —</option>
              <option value="manual">Manual</option>
            </select>
            <input
              placeholder="e.g. Front brake pads & rotors"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              list={form.source === "master" ? "master-services" : undefined}
              autoComplete="off"
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
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

        {/* inspection template pick */}
        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">
            Inspection template (optional)
          </label>
          <select
            value={form.inspectionTemplateId}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                inspectionTemplateId: e.target.value,
              }))
            }
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          >
            <option value="">— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.template_name ?? "Untitled"}
                {typeof t.labor_hours === "number"
                  ? ` (${t.labor_hours.toFixed(1)}h)`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        {/* description */}
        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">Description</label>
          <textarea
            placeholder="Optional details visible to customer"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            className="min-h-[80px] rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        {/* labor */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <label className="text-sm text-neutral-300">
              Labor time (hrs)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 1.5"
              value={form.laborTimeStr}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                const cleaned = v === "" ? "" : v.replace(/^0+(?=\d)/, "");
                setForm((f) => ({ ...f, laborTimeStr: cleaned }));
              }}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-neutral-300">
              Labor rate ($/hr)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 120"
              value={form.laborRateStr}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                const cleaned = v === "" ? "" : v.replace(/^0+(?=\d)/, "");
                setForm((f) => ({ ...f, laborRateStr: cleaned }));
              }}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            />
          </div>
        </div>

        {/* parts */}
        <div className="rounded border border-neutral-800">
          <div className="border-b border-neutral-800 bg-neutral-950/60 px-3 py-2 text-sm text-neutral-300">
            Parts
          </div>
          <div className="space-y-2 p-3">
            {parts.map((p, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[2fr_1fr_1fr_auto_auto] items-center gap-2"
              >
                <input
                  placeholder="Part name (or pick)"
                  value={p.name}
                  onChange={(e) =>
                    setPartField(idx, "name", e.target.value)
                  }
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />
                <input
                  placeholder="Qty"
                  inputMode="numeric"
                  value={p.quantityStr}
                  onChange={(e) =>
                    setPartField(idx, "quantityStr", e.target.value)
                  }
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />
                <input
                  placeholder="Unit cost"
                  inputMode="decimal"
                  value={p.unitCostStr}
                  onChange={(e) =>
                    setPartField(idx, "unitCostStr", e.target.value)
                  }
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => setPickerOpenForRow(idx)}
                  className="rounded border border-neutral-700 px-2 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Pick
                </button>
                <button
                  type="button"
                  onClick={() => removePartRow(idx)}
                  className="px-2 py-2 text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={addPartRow}
              type="button"
              className="text-sm text-orange-400 hover:text-orange-300"
            >
              + Add part
            </button>
          </div>
        </div>

        {/* totals */}
        <div className="flex items-center justify-end gap-6 text-sm">
          <div className="text-neutral-300">
            Parts: <span className="text-white">${partsTotal.toFixed(2)}</span>
          </div>
          <div className="text-neutral-300">
            Labor: <span className="text-white">${laborTotal.toFixed(2)}</span>
          </div>
          <div className="text-neutral-300">
            Total:{" "}
            <span className="font-semibold text-orange-400">
              ${grandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded bg-orange-600 px-4 py-2 font-semibold text-black hover:bg-orange-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Menu Item"}
          </button>
        </div>
      </div>

      {/* existing items */}
      <ul className="max-w-3xl space-y-2">
        {menuItems.map((item) => (
          <li
            key={item.id}
            className="rounded border border-neutral-800 bg-neutral-950 p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-orange-400">{item.name}</strong>
                {item.description ? (
                  <span className="block text-xs text-neutral-400">
                    {item.description}
                  </span>
                ) : null}
              </div>
              <div className="text-sm text-neutral-300">
                {typeof item.total_price === "number" && (
                  <span className="ml-3">
                    Total ${item.total_price.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
        {menuItems.length === 0 && (
          <li className="text-sm text-neutral-400">No items yet.</li>
        )}
      </ul>

      {/* Part picker modal */}
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