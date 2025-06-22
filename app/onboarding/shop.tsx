'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ShopSetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    shop_name: '',
    labor_rate: '',
    parts_markup: '',
    city: '',
    province: '',
    postal_code: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    if (!userId) {
      alert('User not signed in.');
      return;
    }

    const { error } = await supabase.from('shops').insert([
      {
        owner_id: userId,
        ...form,
        labor_rate: parseFloat(form.labor_rate),
        parts_markup: parseFloat(form.parts_markup),
      },
    ]);

    if (error) {
      alert('Error saving shop: ' + error.message);
    } else {
      router.push('/dashboard'); // or wherever your next step is
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 border border-orange-500 p-6 rounded-lg w-full max-w-xl space-y-4 shadow-lg"
      >
        <h1 className="text-3xl font-blackops text-orange-500 text-center mb-4">Set Up Your Shop</h1>

        <input
          name="shop_name"
          placeholder="Shop Name"
          onChange={handleChange}
          value={form.shop_name}
          className="input"
          required
        />
        <input
          name="labor_rate"
          placeholder="Labor Rate ($/hr)"
          type="number"
          step="0.01"
          onChange={handleChange}
          value={form.labor_rate}
          className="input"
          required
        />
        <input
          name="parts_markup"
          placeholder="Parts Markup (%)"
          type="number"
          step="0.1"
          onChange={handleChange}
          value={form.parts_markup}
          className="input"
          required
        />
        <input
          name="city"
          placeholder="City"
          onChange={handleChange}
          value={form.city}
          className="input"
        />
        <input
          name="province"
          placeholder="Province / State"
          onChange={handleChange}
          value={form.province}
          className="input"
        />
        <input
          name="postal_code"
          placeholder="Postal Code"
          onChange={handleChange}
          value={form.postal_code}
          className="input"
        />

        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded"
        >
          Complete Setup
        </button>
      </form>
    </div>
  );
}