// src/app/menu/page.tsx
"use client";

import { useEffect, useState } from "react";
import supabase from "@shared/lib/supabaseClient";
import { useUser } from "@shared/hooks/useUser";
import type { Database } from "@shared/types/supabase";

type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
type InsertMenuItem = Database["public"]["Tables"]["menu_items"]["Insert"];

export default function MenuItemsPage() {
  const { user, isLoading } = useUser();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState<InsertMenuItem>({
    name: "",
    category: "",
    total_price: 0,
    user_id: "",
  });

  const fetchItems = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to fetch menu items:", error);
    } else {
      setMenuItems(data ?? []);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchItems();

      const channel = supabase
        .channel("menu-items-sync")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "menu_items" },
          fetchItems,
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const handleSubmit = async () => {
    if (!form.name || !form.total_price || !user?.id) return;

    const newItem = {
      ...form,
      user_id: user.id,
    };

    const { error } = await supabase.from("menu_items").insert([newItem]);

    if (error) {
      console.error("Insert failed:", error);
    } else {
      setForm({ name: "", category: "", total_price: 0, user_id: user.id });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) console.error("Delete failed:", error);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Menu Items</h1>

      <div className="flex flex-col gap-2 mb-4">
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border px-2 py-1"
        />
        <input
          placeholder="Category"
          value={form.category || ""}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="border px-2 py-1"
        />
        <input
          placeholder="Total Price"
          type="number"
          value={form.total_price}
          onChange={(e) =>
            setForm({ ...form, total_price: parseFloat(e.target.value) || 0 })
          }
          className="border px-2 py-1"
        />
        <button
          onClick={handleSubmit}
          className="bg-black text-white px-4 py-2 rounded"
        >
          Add Menu Item
        </button>
      </div>

      <ul className="space-y-2">
        {menuItems.map((item) => (
          <li
            key={item.id}
            className="border p-2 rounded flex justify-between items-center"
          >
            <span>
              <strong>{item.name}</strong> — ${item.total_price}
            </span>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-red-500"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
