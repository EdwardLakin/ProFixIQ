// app/menu/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";
import { toast } from "sonner";

type DB = Database;
type MenuItem = DB["public"]["Tables"]["menu_items"]["Row"];
type InsertMenuItem = DB["public"]["Tables"]["menu_items"]["Insert"];

type PartForm = { name: string; qty: number; unit_cost: number };

type FormState = {
  name: string;
  labor_time: number;  // hours
  labor_rate: number;  // preview only unless your schema supports it
  description: string; // preview only unless your schema supports it
  category: string;    // preview only unless your schema supports it
  parts: PartForm[];
};

export default function MenuItemsPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const { user, isLoading } = useUser();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState<FormState>({
    name: "",
    labor_time: 0,
    labor_rate: 0,
    description: "",
    category: "",
    parts: [{ name: "", qty: 1, unit_cost: 0 }],
  });

  const laborTotal = (form.labor_time || 0) * (form.labor_rate || 0);
  const partsTotal = form.parts.reduce(
    (sum, p) => sum + (Number(p.qty) || 0) * (Number(p.unit_cost) || 0),
    0
  );
  const grandTotal = laborTotal + partsTotal;

  async function fetchItems() {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch menu items:", error);
      toast.error("Failed to load menu items.");
      return;
    }
    setMenuItems(data ?? []);
  }

  useEffect(() => {
    if (!user?.id) return;

    fetchItems();

    const channel = supabase
      .channel("menu-items-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "menu_items", filter: `user_id=eq.${user.id}` },
        () => fetchItems()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function setPart(idx: number, patch: Partial<PartForm>) {
    setForm((f) => {
      const next = [...f.parts];
      next[idx] = { ...next[idx], ...patch };
      return { ...f, parts: next };
    });
  }
  function addPartRow() {
    setForm((f) => ({ ...f, parts: [...f.parts, { name: "", qty: 1, unit_cost: 0 }] }));
  }
  function removePartRow(idx: number) {
    setForm((f) => ({ ...f, parts: f.parts.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit() {
    if (!user?.id) return;
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    // Only columns we KNOW exist on menu_items
    const payload: InsertMenuItem = {
      name: form.name.trim(),
      labor_time: Number(form.labor_time) || 0,
      user_id: user.id,
    };

    const { data: created, error } = await supabase
      .from("menu_items")
      .insert([payload])
      .select("*")
      .single();

    if (error || !created) {
      console.error("Insert failed:", error);
      toast.error(error?.message ?? "Failed to create menu item");
      return;
    }

    // Try to insert parts if you have a menu_item_parts table
    const cleanedParts = form.parts
      .map((p) => ({
        name: p.name.trim(),
        qty: Number(p.qty) || 0,
        unit_cost: Number(p.unit_cost) || 0,
      }))
      .filter((p) => p.name && p.qty > 0);

    if (cleanedParts.length > 0) {
      try {
        // Shape expected by your (optional) parts table
        // Adjust column names here if your schema differs.
        const partsPayload = cleanedParts.map((p) => ({
          menu_item_id: created.id,
          name: p.name,
          quantity: p.qty,
          unit_cost: p.unit_cost,
          user_id: user.id, // remove if your table doesn't have user_id
        }));

        // If the table/columns don't exist, this will error and we'll catch it.
        const { error: partsErr } = await supabase.from("menu_item_parts").insert(partsPayload);
        if (partsErr) throw partsErr;
      } catch (e: any) {
        console.warn("Parts not saved:", e?.message || e);
        toast.warning("Menu saved, but parts weren’t stored (table/columns not found).");
      }
    }

    toast.success("Menu item created");
    setForm({
      name: "",
      labor_time: 0,
      labor_rate: 0,
      description: "",
      category: "",
      parts: [{ name: "", qty: 1, unit_cost: 0 }],
    });
    fetchItems();
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) {
      console.error("Delete failed:", error);
      toast.error("Delete failed");
    }
  }

  if (isLoading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-blackops text-orange-400 mb-2">Menu Items</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Create preset jobs with labor time and an optional list of parts.
      </p>

      {/* Form */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4 mb-8 max-w-3xl">
        <h2 className="font-blackops text-lg text-orange-300">New Menu Item</h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs text-neutral-400 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 rounded"
              placeholder="e.g. Front brake service"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Category</label>
            <input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 rounded"
              placeholder="e.g. Brakes"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Labor Time (hours)</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.labor_time}
              onChange={(e) =>
                setForm({ ...form, labor_time: Number.isNaN(+e.target.value) ? 0 : +e.target.value })
              }
              className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 rounded"
              placeholder="e.g. 1.5"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-400 mb-1">Labor Rate ($/hr)</label>
            <input
              type="number"
              inputMode="decimal"
              value={form.labor_rate}
              onChange={(e) =>
                setForm({ ...form, labor_rate: Number.isNaN(+e.target.value) ? 0 : +e.target.value })
              }
              className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 rounded"
              placeholder="preview only"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs text-neutral-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-neutral-700 bg-neutral-950 px-3 py-2 rounded min-h-[80px]"
              placeholder="Notes about what’s included"
            />
          </div>
        </div>

        {/* Parts */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Parts</h3>
            <button
              onClick={addPartRow}
              className="text-sm text-orange-400 hover:underline"
              type="button"
            >
              + Add Part
            </button>
          </div>

          <div className="mt-2 space-y-2">
            {form.parts.map((p, idx) => (
              <div
                key={idx}
                className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] items-center border border-neutral-800 bg-neutral-950 p-2 rounded"
              >
                <input
                  placeholder="Part name"
                  value={p.name}
                  onChange={(e) => setPart(idx, { name: e.target.value })}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />
                <input
                  placeholder="Qty"
                  type="number"
                  inputMode="numeric"
                  value={p.qty}
                  onChange={(e) => setPart(idx, { qty: Number.isNaN(+e.target.value) ? 0 : +e.target.value })}
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />
                <input
                  placeholder="Unit cost"
                  type="number"
                  inputMode="decimal"
                  value={p.unit_cost}
                  onChange={(e) =>
                    setPart(idx, { unit_cost: Number.isNaN(+e.target.value) ? 0 : +e.target.value })
                  }
                  className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
                />
                <button
                  type="button"
                  onClick={() => removePartRow(idx)}
                  className="text-red-400 hover:text-red-300 px-2 py-1"
                  aria-label="Remove part"
                >
                  Remove
                </button>
              </div>
            ))}
            {form.parts.length === 0 && <div className="text-sm text-neutral-400">No parts added.</div>}
          </div>
        </div>

        {/* Totals */}
        <div className="mt-6 grid gap-1 text-sm text-neutral-300">
          <div className="flex items-center justify-between">
            <span>Labor total</span>
            <span className="tabular-nums">${laborTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Parts total</span>
            <span className="tabular-nums">${partsTotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between font-semibold text-orange-300">
            <span>Grand total (preview)</span>
            <span className="tabular-nums">${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        <div className="mt-6">
          <button
            onClick={handleSubmit}
            className="bg-orange-500 hover:bg-orange-400 text-black font-semibold px-4 py-2 rounded"
          >
            Save Menu Item
          </button>
        </div>
      </div>

      {/* Saved list */}
      <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-blackops text-lg text-orange-300 mb-3">Saved Items</h2>
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li
              key={item.id}
              className="border border-neutral-800 bg-neutral-950 p-3 rounded flex justify-between items-center"
            >
              <span className="min-w-0">
                <strong className="text-orange-400">{item.name}</strong>{" "}
                {typeof item.labor_time === "number" && (
                  <span className="text-xs text-neutral-400">({item.labor_time.toFixed(1)}h)</span>
                )}
              </span>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </li>
          ))}
          {menuItems.length === 0 && <li className="text-sm text-neutral-400">No items yet.</li>}
        </ul>
      </div>
    </div>
  );
}