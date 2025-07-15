'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useUser } from '@hooks/useUser'; // ✅ FIXED import
import type { Database } from '@/types/supabase';

type MenuItem = {
  id: string;
  name: string;
  category: string;
  labor_time: number;
  parts_cost: number;
  total_price: number;
  user_id: string;
  created_at?: string;
};

export default function MenuItemsPage() {
   const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
); 
  const { user } = useUser();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [form, setForm] = useState({
    name: '',
    labor_time: '',
    parts_cost: '',
    total_price: '',
    category: '',
  });

  const fetchItems = async () => {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('user_id', user?.id);

    if (!error && data) setItems(data as MenuItem[]);
  };

  const handleCreate = async () => {
    const { name, labor_time, parts_cost, total_price } = form;

    if (!name || !total_price) return alert('Name and Total Price are required');

    const newItem = {
      ...form,
      labor_time: labor_time ? parseFloat(labor_time) : 0,
      parts_cost: parts_cost ? parseFloat(parts_cost) : 0,
      total_price: total_price ? parseFloat(total_price) : 0,
      user_id: user?.id,
    };

    const { error } = await supabase.from('menu_items').insert([newItem]);

    if (!error) {
      setForm({
        name: '',
        labor_time: '',
        parts_cost: '',
        total_price: '',
        category: '',
      });
      fetchItems();
    } else {
      console.error('Insert failed', error);
      alert('Failed to save item.');
    }
  };

  useEffect(() => {
    if (user?.id) fetchItems();
  }, [user]);

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Menu Pricing</h1>

      <div className="grid grid-cols-2 gap-4">
        <input
          placeholder="Job Name"
          className="border p-2 rounded"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Category (e.g. Brakes, Oil)"
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

      <div className="pt-6">
        <h2 className="text-xl font-semibold mb-2">Existing Items</h2>
        {items.length === 0 && <p className="text-gray-500">No menu items yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="border p-3 rounded mb-3 bg-white dark:bg-gray-900">
            <strong>{item.name}</strong> — ${item.total_price.toFixed(2)} ({item.labor_time} hrs)
            <div className="text-sm text-gray-600">
              Category: {item.category || '—'}<br />
              Parts: ${item.parts_cost.toFixed(2)}<br />
              Created: {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}