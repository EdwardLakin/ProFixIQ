"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";
import { toast } from "sonner";
import { PartPicker, type PickedPart } from "@parts/components/PartPicker";
import { masterServicesList } from "@inspections/lib/inspection/masterServicesList";

type DB = Database;

// rows
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type BaseInsertMenuItem = DB["public"]["Tables"]["menu_items"]["Insert"];
type InsertMenuItemPart = DB["public"]["Tables"]["menu_item_parts"]["Insert"];
type TemplateRow = DB["public"]["Tables"]["inspection_templates"]["Row"];

// 👇 extend what Supabase generated, because TS doesn’t know about the new column yet
type InsertMenuItemExt = BaseInsertMenuItem & {
  inspection_template_id?: string | null;
  labor_hours?: number | null; // safe to keep here even if the column exists with a different name
};

type PartFormRow = {
  name: string;
  quantityStr: string;
  unitCostStr: string;
  part_id?: string | null;
};

type FormState = {
  name: string;
  description: string;
  laborTimeStr: string;
  laborRateStr: string;
  inspectionTemplateId: string | null;
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

  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    laborTimeStr: "",
    laborRateStr: "",
    inspectionTemplateId: null,
  });

  // templates for “attach inspection”
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

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

  const grandTotal = useMemo(() => partsTotal + laborTotal, [partsTotal, laborTotal]);

  const fetchItems = useCallback(async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch menu items:", error);
      toast.error("Could not load menu items");
      return;
    }
    setMenuItems(data ?? []);
  }, [supabase, user?.id]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const { data: me } = await supabase.auth.getUser();
      const uid = me?.user?.id ?? null;

      const minePromise = uid
        ? supabase
            .from("inspection_templates")
            .select("*")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as TemplateRow[] });

      const sharedPromise = supabase
        .from("inspection_templates")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      const [{ data: mineRaw }, { data: sharedRaw }] = await Promise.all([
        minePromise,
        sharedPromise,
      ]);

      const pool = [
        ...(Array.isArray(mineRaw) ? mineRaw : []),
        ...(Array.isArray(sharedRaw) ? sharedRaw : []),
      ];

      setTemplates(pool);
    } catch (e) {
      console.warn("Failed to fetch templates", e);
    } finally {
      setTemplatesLoading(false);
    }
  }, [supabase]);

  // bootstrap
  useEffect(() => {
    if (!user?.id) return;

    void fetchItems();
    void fetchTemplates();

    const channel = supabase
      .channel("menu-items-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items", filter: `user_id=eq.${user.id}` },
        () => void fetchItems(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user?.id, fetchItems, fetchTemplates]);

  // parts helpers
  const setPartField = (idx: number, field: "name" | "quantityStr" | "unitCostStr", value: string) => {
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
    setParts((rows) => [...rows, { name: "", quantityStr: "", unitCostStr: "", part_id: null }]);
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
        rows.map((r, i) => (i === rowIdx ? { ...r, part_id: sel.part_id } : r)),
      );
    });
  };

  const handleSubmit = useCallback(async () => {
    if (!user?.id) return;

    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      const itemInsert: InsertMenuItemExt = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        labor_time: toNum(form.laborTimeStr),
        // this field may or may not exist in your DB; keeping it optional here
        labor_hours: null,
        part_cost: partsTotal,
        total_price: grandTotal,
        user_id: user.id,
        shop_id: (user as unknown as { shop_id?: string | null })?.shop_id ?? null,
        // 👇 our new column
        inspection_template_id: form.inspectionTemplateId,
      };

      const { data: created, error: createErr } = await supabase
        .from("menu_items")
        .insert(itemInsert)
        .select("id")
        .single();

      if (createErr || !created) {
        console.error("Create menu item failed:", createErr);
        toast.error(createErr?.message ?? "Failed to create menu item");
        return;
      }

      const cleanedParts: InsertMenuItemPart[] = parts
        .filter((p) => p.name.trim().length > 0 && toNum(p.quantityStr) > 0)
        .map<InsertMenuItemPart>((p) => ({
          menu_item_id: created.id,
          name: p.name.trim(),
          quantity: toNum(p.quantityStr),
          unit_cost: toNum(p.unitCostStr),
          user_id: user.id,
        }));

      if (cleanedParts.length > 0) {
        const { error: partsErr } = await supabase.from("menu_item_parts").insert(cleanedParts);
        if (partsErr) {
          console.warn("Parts not saved:", partsErr);
          toast.warning("Menu item saved, but parts weren’t stored.");
        }
      }

      toast.success("Menu item created");

      setForm((f) => ({
        ...f,
        name: "",
        description: "",
        laborTimeStr: "",
        // keep rate sticky
      }));
      setParts([{ name: "", quantityStr: "", unitCostStr: "", part_id: null }]);

      await fetchItems();
    } finally {
      setSaving(false);
    }
  }, [form, parts, supabase, user?.id, partsTotal, grandTotal, fetchItems]);

  if (isLoading) return <div className="p-4 text-white">Loading...</div>;

  // flatten service names for the dropdown
  const masterServiceNames = masterServicesList.flatMap((cat) =>
    cat.items.map((i) => i.item),
  );

  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-blackops text-orange-400">Menu Items</h1>

      {/* Form */}
      <div className="mb-8 grid max-w-2xl gap-3">
        {/* service name + master picker */}
        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">Service name</label>
          <div className="flex gap-2">
            <select
              className="w-1/3 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                setForm((f) => ({ ...f, name: val }));
              }}
            >
              <option value="">— from master —</option>
              {masterServiceNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <input
              placeholder="e.g. Front brake pads & rotors"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
            />
          </div>
        </div>

        {/* optional inspection template */}
        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">Inspection template (optional)</label>
          <select
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
            value={form.inspectionTemplateId ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, inspectionTemplateId: e.target.value || null }))
            }
            disabled={templatesLoading}
          >
            <option value="">— none —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.template_name ?? "Untitled"}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">Description</label>
          <textarea
            placeholder="Optional details visible to customer"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="min-h-[80px] rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        {/* Labor */}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <label className="text-sm text-neutral-300">Labor time (hrs)</label>
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
            <label className="text-sm text-neutral-300">Labor rate ($/hr)</label>
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

        {/* Parts */}
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
                  onChange={(e) => setPartField(idx, "name", e.target.value)}
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />

                <input
                  placeholder="Qty"
                  type="text"
                  inputMode="numeric"
                  value={p.quantityStr}
                  onChange={(e) => setPartField(idx, "quantityStr", e.target.value)}
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />

                <input
                  placeholder="Unit cost"
                  type="text"
                  inputMode="decimal"
                  value={p.unitCostStr}
                  onChange={(e) => setPartField(idx, "unitCostStr", e.target.value)}
                  className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                />

                <button
                  type="button"
                  onClick={() => setPickerOpenForRow(idx)}
                  className="rounded border border-neutral-700 px-2 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                  title="Pick from Parts"
                >
                  Pick
                </button>

                <button
                  onClick={() => removePartRow(idx)}
                  className="px-2 py-2 text-red-400 hover:text-red-300"
                  aria-label="Remove part"
                >
                  ✕
                </button>
              </div>
            ))}

            <button
              onClick={addPartRow}
              className="text-sm text-orange-400 hover:text-orange-300"
              type="button"
            >
              + Add part
            </button>
          </div>
        </div>

        {/* Totals */}
        <div className="flex items-center justify-end gap-6 text-sm">
          <div className="text-neutral-300">
            Parts: <span className="text-white">${partsTotal.toFixed(2)}</span>
          </div>
          <div className="text-neutral-300">
            Labor: <span className="text-white">${laborTotal.toFixed(2)}</span>
          </div>
          <div className="text-neutral-300">
            Total: <span className="font-semibold text-orange-400">${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded bg-orange-600 px-4 py-2 font-semibold text-black hover:bg-orange-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Menu Item"}
          </button>
        </div>
      </div>

      {/* Existing items */}
      <ul className="max-w-3xl space-y-2">
        {menuItems.map((item) => (
          <li
            key={item.id}
            className="rounded border border-neutral-800 bg-neutral-950 p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <strong className="text-orange-400">{item.name}</strong>
                {item.description && (
                  <span className="block text-xs text-neutral-400">
                    {item.description}
                  </span>
                )}
              </div>
              <div className="text-sm text-neutral-300">
                {typeof item.total_price === "number" && (
                  <span className="ml-3">Total ${item.total_price.toFixed(2)}</span>
                )}
              </div>
            </div>
          </li>
        ))}
        {menuItems.length === 0 && (
          <li className="text-sm text-neutral-400">No items yet.</li>
        )}
      </ul>

      {/* inline PartPicker */}
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