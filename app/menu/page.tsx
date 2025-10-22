"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";
import { toast } from "sonner";

// Reuse your PartPicker component
import { PartPicker, type PickedPart } from "@parts/components/PartPicker";

type DB = Database;

// Rows / inserts we use
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type InsertMenuItem = DB["public"]["Tables"]["menu_items"]["Insert"];
type InsertMenuItemPart = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

// Local form types (edit as strings to avoid “01.5” visual issue)
type PartFormRow = {
  name: string;         // label shown to user (from parts.name or manual)
  quantityStr: string;  // edited as string
  unitCostStr: string;  // edited as string
  part_id?: string | null; // optional link to an actual part (not required by DB)
};

type FormState = {
  name: string;
  description: string;
  laborTimeStr: string; // edited as string
  laborRateStr: string; // edited as string
};

export default function MenuItemsPage() {
  const supabase = createClientComponentClient<DB>();
  const { user, isLoading } = useUser();

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [saving, setSaving] = useState(false);

  // PartPicker UI state
  const [pickerOpenForRow, setPickerOpenForRow] = useState<number | null>(null);

  const [parts, setParts] = useState<PartFormRow[]>([
    { name: "", quantityStr: "", unitCostStr: "", part_id: null },
  ]);

  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    laborTimeStr: "", // visually empty, not "0"
    laborRateStr: "",
  });

  // parse helpers (robust)
  const toNum = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  // derive totals
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

  // Load existing items
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

  // bootstrap + realtime
  useEffect(() => {
    if (!user?.id) return;

    void fetchItems();

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
  }, [supabase, user?.id, fetchItems]);

  // parts row helpers
  const setPartField = (idx: number, field: "name" | "quantityStr" | "unitCostStr", value: string) => {
    const cleanNumeric = (v: string) => {
      if (v === "") return "";
      if (/^\d/.test(v)) v = v.replace(/^0+(?=\d)/, ""); // 00012 -> 12, 01.5 -> 1.5
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
                  : cleanNumeric(value.replace(/[^\d.]/g, "")), // only digits + dot
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

  // When a part is picked via PartPicker: fill name (and optionally unit cost if you want to default)
  const handlePickPart = (rowIdx: number) => (sel: PickedPart) => {
    // We only get: part_id, qty, location_id (optional)
    // Hydrate name from parts table
    (async () => {
      const { data, } = await supabase
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
                // unitCostStr: r.unitCostStr || "0", // leave to user; uncomment to default 0
              }
            : r,
        ),
      );

      toast.success(`Added ${label} to row`);
    })().catch(() => {
      // fallback: still set part_id
      setParts((rows) =>
        rows.map((r, i) =>
          i === rowIdx ? { ...r, part_id: sel.part_id } : r,
        ),
      );
    });
  };

  // submit
  const handleSubmit = useCallback(async () => {
    if (!user?.id) return;

    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSaving(true);
    try {
      // Build the menu_items insert
      const itemInsert: InsertMenuItem = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        labor_time: toNum(form.laborTimeStr), // number
        labor_hours: null,                    // not used here
        part_cost: partsTotal,
        total_price: grandTotal,
        user_id: user.id,
        shop_id: (user as unknown as { shop_id?: string | null })?.shop_id ?? null,
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

      // Insert parts if provided (skip empty rows)
      const cleanedParts: InsertMenuItemPart[] = parts
        .filter((p) => p.name.trim().length > 0 && toNum(p.quantityStr) > 0)
        .map<InsertMenuItemPart>((p) => ({
          menu_item_id: created.id,
          name: p.name.trim(),
          quantity: toNum(p.quantityStr),
          unit_cost: toNum(p.unitCostStr),
          user_id: user.id,
          // NOTE: if you later add part_id column to menu_item_parts, include it here:
          // part_id: p.part_id ?? null,
        }));

      if (cleanedParts.length > 0) {
        const { error: partsErr } = await supabase.from("menu_item_parts").insert(cleanedParts);
        if (partsErr) {
          console.warn("Parts not saved:", partsErr);
          toast.warning("Menu item saved, but parts weren’t stored.");
        }
      }

      toast.success("Menu item created");

      // Clear form + rows
      setForm({
        name: "",
        description: "",
        laborTimeStr: "",
        laborRateStr: form.laborRateStr, // keep rate sticky; or set "" if you prefer
      });
      setParts([{ name: "", quantityStr: "", unitCostStr: "", part_id: null }]);

      // Refresh list (MenuQuickAdd listens realtime and will update, too)
      await fetchItems();
    } finally {
      setSaving(false);
    }
  }, [form, parts, supabase, user?.id, partsTotal, grandTotal, fetchItems]);

  if (isLoading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-blackops text-orange-400 mb-4">Menu Items</h1>

      {/* Form */}
      <div className="grid gap-3 mb-8 max-w-2xl">
        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">Service name</label>
          <input
            placeholder="e.g. Front brake pads & rotors"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
          />
        </div>

        <div className="grid gap-2">
          <label className="text-sm text-neutral-300">Description</label>
          <textarea
            placeholder="Optional details visible to customer"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
            className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded min-h-[80px]"
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
              className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
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
              className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
            />
          </div>
        </div>

        {/* Parts */}
        <div className="border border-neutral-800 rounded">
          <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-950/60 text-sm text-neutral-300">
            Parts
          </div>
          <div className="p-3 space-y-2">
            {parts.map((p, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[2fr_1fr_1fr_auto_auto] gap-2 items-center"
              >
                <input
                  placeholder="Part name (or pick)"
                  value={p.name}
                  onChange={(e) => setPartField(idx, "name", e.target.value)}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />

                <input
                  placeholder="Qty"
                  type="text"
                  inputMode="numeric"
                  value={p.quantityStr}
                  onChange={(e) => setPartField(idx, "quantityStr", e.target.value)}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />

                <input
                  placeholder="Unit cost"
                  type="text"
                  inputMode="decimal"
                  value={p.unitCostStr}
                  onChange={(e) => setPartField(idx, "unitCostStr", e.target.value)}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
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
                  className="text-red-400 hover:text-red-300 px-2 py-2"
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
            Total: <span className="text-orange-400 font-semibold">${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-black font-semibold px-4 py-2 rounded"
          >
            {saving ? "Saving…" : "Save Menu Item"}
          </button>
        </div>
      </div>

      {/* Existing items */}
      <ul className="space-y-2 max-w-3xl">
        {menuItems.map((item) => (
          <li
            key={item.id}
            className="border border-neutral-800 bg-neutral-950 p-3 rounded"
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

      {/* Inline PartPicker – only one open at a time */}
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