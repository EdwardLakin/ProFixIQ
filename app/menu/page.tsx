"use client";

import { useState, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useUser } from "@/hooks/useUser";

export default function MenuItemsPage() {
  const supabase = createBrowserClient();
  const { user } = useUser();
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    labor_time: "",
    parts_cost: "",
    total_price: "",
    category: "",
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .eq("user_id", user?.id);
    if (!error) setItems(data || []);
  };

  const handleCreate = async () => {
    if (!form.name || !form.total_price) return alert("Fill required fields");
    await supabase.from("menu_items").insert([{ ...form, user_id: user?.id }]);
    setForm({
      name: "",
      labor_time: "",
      parts_cost: "",
      total_price: "",
      category: "",
    });
    fetchItems();
  };

  useEffect(() => {
    if (user?.id) fetchItems();
  }, [user]);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Menu Pricing</h1>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <input
          placeholder="Job Name"
          className="border p-2 rounded"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Category (Brakes, Oil Change...)"
          className="border p-2 rounded"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <input
          placeholder="Labor Time (hrs)"
          type="number"
          className="border p-2 rounded"
          value={form.labor_time}
          onChange={(e) => setForm({ ...form, labor_time: e.target.value })}
        />
        <input
          placeholder="Parts Cost ($)"
          type="number"
          className="border p-2 rounded"
          value={form.parts_cost}
          onChange={(e) => setForm({ ...form, parts_cost: e.target.value })}
        />
        <input
          placeholder="Total Price ($)"
          type="number"
          className="border p-2 rounded col-span-2"
          value={form.total_price}
          onChange={(e) => setForm({ ...form, total_price: e.target.value })}
        />
      </div>

      <button
        onClick={handleCreate}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Add Menu Item
      </button>

      <h2 className="text-xl font-semibold mt-6 mb-2">Existing Items</h2>
      {items.length === 0 && <p>No menu items yet.</p>}
      {items.map((item) => (
        <div key={item.id} className="border p-3 rounded mb-2">
          <strong>{item.name}</strong> – ${item.total_price} ({item.labor_time}{" "}
          hrs)
          <br />
          <span className="text-sm text-gray-600">
            Category: {item.category}
          </span>
        </div>
      ))}
    </div>
  );
}
