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
  const [role, setRole] = useState('owner');

  // User address
  const [userStreet, setUserStreet] = useState('');
  const [userCity, setUserCity] = useState('');
  const [userProvince, setUserProvince] = useState('');
  const [userPostal, setUserPostal] = useState('');

  // Shop fields
  const [businessName, setBusinessName] = useState('');
  const [shopName, setShopName] = useState('');

  const [shopStreet, setShopStreet] = useState('');
  const [shopCity, setShopCity] = useState('');
  const [shopProvince, setShopProvince] = useState('');
  const [shopPostal, setShopPostal] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const linkStripeCustomer = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const sessionId = new URLSearchParams(window.location.search).get('session_id');

      if (user) {
        setUserId(user.id);

        if (sessionId) {
          await fetch('/api/stripe/link-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, userId: user.id }),
          });
        }
      } else {
        router.push('/auth');
      }
    };

    linkStripeCustomer();
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('User not found.');
      setLoading(false);
      return;
    }

    const email = user.email;

    const { data: newShop, error: shopError } = await supabase
      .from('shops')
      .insert([
        {
          name: shopName || businessName,
          street: shopStreet,
          city: shopCity,
          province: shopProvince,
          postal: shopPostal,
        },
      ])
      .select()
      .single();

    if (shopError) {
      setError('Failed to create shop.');
      setLoading(false);
      return;
    }

    const newShopId = newShop.id;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName,
        phone,
        role,
        shop_id: newShopId,
        business_name: businessName,
        shop_name: shopName || businessName,
        street: userStreet,
        city: userCity,
        province: userProvince,
        postal: userPostal,
      })
      .eq('id', user.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          subject: 'Welcome to ProFixIQ!',
          html: `<p>Hi ${fullName},</p><p>Your shop ${shopName || businessName} is now set up.</p>`,
        }),
      });
    } catch (err) {
      console.error('Email send failed:', err);
    }

    switch (role) {
      case 'owner':
        router.push('/dashboard/owner');
        break;
      case 'admin':
        router.push('/dashboard/admin');
        break;
      case 'manager':
        router.push('/dashboard/manager');
        break;
      case 'advisor':
        router.push('/dashboard/advisor');
        break;
      case 'mechanic':
        router.push('/dashboard/tech');
        break;
      default:
        router.push('/');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">Onboarding</h1>

      <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4">
        <h2 className="text-xl text-orange-400 mt-4">Your Info</h2>
        <input type="text" required placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        <input type="text" required placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        <input type="text" required placeholder="Street Address" value={userStreet} onChange={(e) => setUserStreet(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        <div className="flex gap-2">
          <input type="text" required placeholder="City" value={userCity} onChange={(e) => setUserCity(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
          <input type="text" required placeholder="Province" value={userProvince} onChange={(e) => setUserProvince(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
          <input type="text" required placeholder="Postal Code" value={userPostal} onChange={(e) => setUserPostal(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        </div>

        <h2 className="text-xl text-orange-400 mt-6">Shop Info</h2>
        <input type="text" required placeholder="Business Name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        <input type="text" placeholder="Shop Name (Optional)" value={shopName} onChange={(e) => setShopName(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        <input type="text" required placeholder="Street Address" value={shopStreet} onChange={(e) => setShopStreet(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        <div className="flex gap-2">
          <input type="text" required placeholder="City" value={shopCity} onChange={(e) => setShopCity(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
          <input type="text" required placeholder="Province" value={shopProvince} onChange={(e) => setShopProvince(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
          <input type="text" required placeholder="Postal Code" value={shopPostal} onChange={(e) => setShopPostal(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500" />
        </div>

        <select required value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-2 rounded bg-gray-900 border border-orange-500">
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="advisor">Advisor</option>
          <option value="mechanic">Mechanic</option>
        </select>

        <button type="submit" disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded">
          {loading ? 'Saving...' : 'Complete Onboarding'}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>
    </div>
  );
}