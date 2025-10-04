"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";
import { toast } from "sonner";

type DB = Database;

// Rows / inserts we use
type MenuItemRow = DB["public"]["Tables"]["menu_items"]["Row"];
type InsertMenuItem = DB["public"]["Tables"]["menu_items"]["Insert"];
type InsertMenuItemPart = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

// Local form types (only fields we actually edit)
type PartFormRow = {
  name: string;
  quantity: number;
  unit_cost: number;
};

type FormState = {
  name: string;
  description: string;
  labor_time: number; // hours
  labor_rate: number; // $/hr (defaults to shop.labor_rate if available)
};

export default function MenuItemsPage() {
  const supabase = createClientComponentClient<DB>();
  const { user, isLoading } = useUser(); // your hook exposes `user` (profile), optionally with shop

  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [parts, setParts] = useState<PartFormRow[]>([
    { name: "", quantity: 1, unit_cost: 0 },
  ]);

  const [form, setForm] = useState<FormState>({
    name: "",
    description: "",
    labor_time: 0,
    labor_rate: 0,
  });

  // derive totals
  const partsTotal = useMemo(
    () =>
      parts.reduce((sum, p) => {
        const q = Number.isFinite(p.quantity) ? p.quantity : 0;
        const u = Number.isFinite(p.unit_cost) ? p.unit_cost : 0;
        return sum + q * u;
      }, 0),
    [parts],
  );

  const laborTotal = useMemo(
    () => (Number.isFinite(form.labor_time) ? form.labor_time : 0) * (Number.isFinite(form.labor_rate) ? form.labor_rate : 0),
    [form.labor_time, form.labor_rate],
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
      return;
    }
    setMenuItems(data ?? []);
  }, [supabase, user?.id]);

  // bootstrap defaults (labor_rate from shop if present) + realtime sync
  useEffect(() => {
    if (!user?.id) return;


    // If you want to default from profile.shop/labor_rate and your hook exposes it,
    // uncomment & adjust:
    // if (userShop?.labor_rate != null) {
    //   setForm((f) => ({ ...f, labor_rate: userShop.labor_rate ?? 0 }));
    // }

    // initial load
    void fetchItems();

    // realtime for this user’s rows
    const channel = supabase
      .channel("menu-items-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "menu_items",
          filter: `user_id=eq.${user.id}`,
        },
        () => void fetchItems(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, user?.id, fetchItems]);

  // parts row helpers
  const setPartField = (idx: number, field: keyof PartFormRow, value: string) => {
    setParts((rows) =>
      rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              [field]:
                field === "name"
                  ? value
                  : Number.isNaN(parseFloat(value))
                    ? 0
                    : parseFloat(value),
            }
          : r,
      ),
    );
  };

  const addPartRow = () => {
    setParts((rows) => [...rows, { name: "", quantity: 1, unit_cost: 0 }]);
  };
  const removePartRow = (idx: number) => {
    setParts((rows) => rows.filter((_, i) => i !== idx));
  };

  // submit
  const handleSubmit = useCallback(async () => {
    if (!user?.id) return;

    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    // Build the menu_items insert
    const itemInsert: InsertMenuItem = {
      name: form.name,
      description: form.description || null,
      labor_time: Number.isFinite(form.labor_time) ? form.labor_time : 0,
      labor_hours: null, // unused in this form, but exists in schema
      part_cost: partsTotal,
      total_price: grandTotal,
      user_id: user.id,
      shop_id: (user as unknown as { shop_id?: string | null })?.shop_id ?? null,
      // keep other nullable columns absent so defaults/NULL apply
    };

    // Create the menu item, returning the new id
    const { data: created, error: createErr } = await supabase
      .from("menu_items")
      .insert(itemInsert)
      .select("id")
      .single();

    if (createErr || !created) {
      console.error("Create menu item failed:", createErr);
      toast.error("Failed to create menu item");
      return;
    }

    // Insert parts if provided (skip empty rows)
    const cleanedParts: InsertMenuItemPart[] = parts
      .filter((p) => p.name.trim().length > 0 && p.quantity > 0)
      .map<InsertMenuItemPart>((p) => ({
        menu_item_id: created.id,
        name: p.name.trim(),
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        user_id: user.id,
      }));

    if (cleanedParts.length > 0) {
      try {
        const { error: partsErr } = await supabase
          .from("menu_item_parts")
          .insert(cleanedParts);
        if (partsErr) throw partsErr;
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.warn("Parts not saved:", err?.message ?? e);
        toast.warning(
          "Menu item saved, but parts weren't stored (table/columns missing or RLS denied).",
        );
      }
    }

    toast.success("Menu item created");

    // reset form
    setForm({
      name: "",
      description: "",
      labor_time: 0,
      labor_rate: form.labor_rate, // keep rate sticky
    });
    setParts([{ name: "", quantity: 1, unit_cost: 0 }]);
  }, [form, parts, supabase, user?.id, partsTotal, grandTotal]);

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
              type="number"
              inputMode="decimal"
              value={form.labor_time}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  labor_time: Number.isNaN(parseFloat(e.target.value))
                    ? 0
                    : parseFloat(e.target.value),
                }))
              }
              className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm text-neutral-300">Labor rate ($/hr)</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.labor_rate}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  labor_rate: Number.isNaN(parseFloat(e.target.value))
                    ? 0
                    : parseFloat(e.target.value),
                }))
              }
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
                className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-center"
              >
                <input
                  placeholder="Part name"
                  value={p.name}
                  onChange={(e) => setPartField(idx, "name", e.target.value)}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />
                <input
                  placeholder="Qty"
                  type="number"
                  inputMode="numeric"
                  value={p.quantity}
                  onChange={(e) => setPartField(idx, "quantity", e.target.value)}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />
                <input
                  placeholder="Unit cost"
                  type="number"
                  inputMode="decimal"
                  value={p.unit_cost}
                  onChange={(e) => setPartField(idx, "unit_cost", e.target.value)}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />
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
            className="bg-orange-600 hover:bg-orange-700 text-black font-semibold px-4 py-2 rounded"
          >
            Save Menu Item
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
    </div>
  );
}