'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function ProfileSetupPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'manager' | 'mechanic' | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [businessName, setBusinessName] = useState('');

  // Prefill form on load
  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data) {
        setFullName(data.full_name || '');
        setPhone(data.phone || '');
        setRole((data.role as 'owner' | 'admin' | 'manager' | 'mechanic') || null);
        setShopId(data.shop_id || null);
        setShopName(data.shop_name || '');
        setBusinessName(data.business_name || '');

        // Auto-redirect if already complete
        if (data.role && data.shop_name) {
          router.push('/app');
          return;
        }
      }

      setLoading(false);
    };

    loadProfile();
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !role) return;

    const payload: Database['public']['Tables']['profiles']['Insert'] = {
      id: user.id,
      full_name: fullName,
      phone,
      role,
      shop_id: shopId,
      shop_name: shopName,
      business_name: businessName,
    };

    const { error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('Profile update failed:', error);
      return;
    }

    router.push('/app');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-blackops text-orange-500 mb-6">Complete Your Profile</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <input
          type="text"
          placeholder="Full Name"
          className="w-full p-3 rounded bg-neutral-800 text-white"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />

        <input
          type="tel"
          placeholder="Phone Number"
          className="w-full p-3 rounded bg-neutral-800 text-white"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        <input
          type="text"
          placeholder="Business Name"
          className="w-full p-3 rounded bg-neutral-800 text-white"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
        />

        <input
          type="text"
          placeholder="Shop Name"
          className="w-full p-3 rounded bg-neutral-800 text-white"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
        />

        <select
          className="w-full p-3 rounded bg-neutral-800 text-white"
          value={role ?? ''}
          onChange={(e) =>
            setRole(
              e.target.value
                ? (e.target.value as 'owner' | 'admin' | 'manager' | 'mechanic')
                : null
            )
          }
          required
        >
          <option value="">Select Role</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="mechanic">Mechanic</option>
        </select>

        <button
          type="submit"
          className="w-full p-3 bg-orange-500 hover:bg-orange-600 rounded text-white font-bold"
        >
          Save & Continue
        </button>
      </form>
    </div>
  );
}