'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function OnboardingPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [shopName, setShopName] = useState('');
  const [role, setRole] = useState('owner');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        router.push('/auth');
        return;
      }

      setUserId(user.id);
    };

    getUser();
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!userId) {
      setError('User not found.');
      setLoading(false);
      return;
    }

    // Optional: Create a shop record if you're using multi-tenant structure
    const { data: newShop, error: shopError } = await supabase
      .from('shops')
      .insert([{ name: shopName || businessName }])
      .select()
      .single();

    if (shopError) {
      setError('Failed to create shop.');
      setLoading(false);
      return;
    }

    const newShopId = newShop.id;
    setShopId(newShopId);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        role,
        business_name: businessName,
        shop_name: shopName || businessName,
        shop_id: newShopId,
      })
      .eq('id', userId);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Redirect based on role
    if (role === 'owner') router.push('/dashboard/owner');
    else if (role === 'admin') router.push('/dashboard/admin');
    else if (role === 'manager') router.push('/dashboard/manager');
    else if (role === 'advisor') router.push('/dashboard/advisor');
    else if (role === 'mechanic') router.push('/dashboard/tech');
    else router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">Onboarding</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <input
          type="text"
          placeholder="Full Name"
          required
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Phone"
          required
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          type="text"
          placeholder="Business Name"
          required
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Shop Name (optional)"
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
        />

        <select
          required
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="advisor">Advisor</option>
          <option value="mechanic">Mechanic</option>
        </select>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          {loading ? 'Saving...' : 'Complete Onboarding'}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>
    </div>
  );
}