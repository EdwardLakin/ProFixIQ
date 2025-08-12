// src/app/menu/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useUser } from "@auth/hooks/useUser";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type InsertMenuItem = Database["public"]["Tables"]["menu_items"]["Insert"];

export default function MenuItemsPage() {
  const supabase = createClientComponentClient<Database>();
  const { user, isLoading } = useUser();

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState<InsertMenuItem>({
    name: "",
    category: "",
    total_price: 0,
    // user_id is set on submit so we don’t store a stale value here
    user_id: undefined as unknown as string, // satisfies Insert type; we set it before insert
  });

  async function fetchItems() {
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
  }

  useEffect(() => {
    if (!user?.id) return;

    fetchItems();

    // realtime updates for this user’s items only
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
        () => fetchItems()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleSubmit() {
    if (!user?.id) return;
    if (!form.name || Number.isNaN(form.total_price)) return;

    const newItem: InsertMenuItem = {
      ...form,
      user_id: user.id,
    };

    const { error } = await supabase.from("menu_items").insert([newItem]);

    if (error) {
      console.error("Insert failed:", error);
      return;
    }

    setForm({
      name: "",
      category: "",
      total_price: 0,
      user_id: undefined as unknown as string,
    });
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) console.error("Delete failed:", error);
  }

  if (isLoading) return <div className="p-4">Loading...</div>;

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-blackops text-orange-400 mb-4">Menu Items</h1>

      <div className="grid gap-2 mb-6 max-w-md">
        <input
          placeholder="Name"
          value={form.name ?? ""}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
        />
        <input
          placeholder="Category"
          value={form.category ?? ""}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
        />
        <input
          placeholder="Total Price"
          type="number"
          inputMode="decimal"
          value={form.total_price ?? 0}
          onChange={(e) =>
            setForm({
              ...form,
              total_price: parseFloat(e.target.value || "0"),
            })
          }
          className="border border-neutral-700 bg-neutral-900 px-3 py-2 rounded"
        />
        <button
          onClick={handleSubmit}
          className="bg-orange-600 hover:bg-orange-700 text-black font-semibold px-4 py-2 rounded"
        >
          Add Menu Item
        </button>
      </div>

      <ul className="space-y-2 max-w-2xl">
        {menuItems.map((item) => (
          <li
            key={item.id}
            className="border border-neutral-800 bg-neutral-950 p-3 rounded flex justify-between items-center"
          >
            <span>
              <strong className="text-orange-400">{item.name}</strong>{" "}
              {item.category && (
                <span className="text-xs text-neutral-400">
                  ({item.category})
                </span>
              )}{" "}
              — ${Number(item.total_price ?? 0).toFixed(2)}
            </span>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </li>
        ))}
        {menuItems.length === 0 && (
          <li className="text-sm text-neutral-400">No items yet.</li>
        )}
      </ul>
    </div>
  );
}