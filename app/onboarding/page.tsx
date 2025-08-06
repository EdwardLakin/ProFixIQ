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

  const [userStreet, setUserStreet] = useState('');
  const [userCity, setUserCity] = useState('');
  const [userProvince, setUserProvince] = useState('');
  const [userPostal, setUserPostal] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopStreet, setShopStreet] = useState('');
  const [shopCity, setShopCity] = useState('');
  const [shopProvince, setShopProvince] = useState('');
  const [shopPostal, setShopPostal] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const linkStripeCustomer = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const sessionId = new URLSearchParams(window.location.search).get('session_id');

      if (user) {
        setUserEmail(user.email ?? null);
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
    setUserEmail(email ?? null);

    if (!businessName || !shopStreet || !shopCity || !shopProvince || !shopPostal) {
      setError('Please complete all required shop fields.');
      setLoading(false);
      return;
    }

    const { data: newShop, error: shopError } = await supabase
      .from('shops')
      .insert([
        {
          id: crypto.randomUUID(),
          business_name: businessName,
          shop_name: shopName || businessName,
          plan: 'diy',
          created_at: new Date().toISOString(),
          owner_id: user.id,
          uuid: user.id,
          address: shopStreet,
          city: shopCity,
          province: shopProvince,
          postal_code: shopPostal,
        },
      ])
      .select()
      .maybeSingle();

    if (shopError || !newShop) {
      console.error('Shop creation error:', shopError?.message || shopError);
      setError('Failed to create shop. Please try again.');
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
        address: userStreet,
        city: userCity,
        province: userProvince,
        postal_code: userPostal,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Profile update error:', updateError.message);
      setError('Failed to update profile.');
      setLoading(false);
      return;
    }

    await fetch('/api/set-role-cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });

    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          subject: 'Welcome to ProFixIQ!',
          html: `<p>Hi ${fullName},</p><p>Your shop <strong>${shopName || businessName}</strong> is now set up.</p>`,
        }),
      });
      setEmailSent(true);
    } catch (err) {
      console.error('Email send failed:', err);
    }

    try {
      await fetch('/api/confirm-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      console.error('Email confirm failed:', err);
    }

    setSuccess(true);
    setLoading(false);

    const redirectMap: Record<string, string> = {
      owner: '/dashboard/owner',
      admin: '/dashboard/admin',
      manager: '/dashboard/manager',
      advisor: '/dashboard/advisor',
      mechanic: '/dashboard/tech',
    };

    router.push(redirectMap[role] || '/');
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
        {success && <p className="text-green-400 text-md mt-4">🎉 Onboarding complete! Redirecting...</p>}

        {emailSent && !success && userEmail && (
          <button
            type="button"
            onClick={async () => {
              setResending(true);
              try {
                await fetch('/api/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    email: userEmail,
                    subject: 'Welcome to ProFixIQ!',
                    html: `<p>Hi ${fullName},</p><p>Your shop <strong>${shopName || businessName}</strong> is now set up.</p>`,
                  }),
                });
              } catch (err) {
                console.error('Resend failed:', err);
              }
              setResending(false);
            }}
            className="text-sm text-orange-400 underline mt-2"
            disabled={resending}
          >
            {resending ? 'Resending...' : 'Resend Welcome Email'}
          </button>
        )}
      </form>
    </div>
  );
}