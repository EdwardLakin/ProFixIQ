'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function ProfileSetupPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Auth
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Profile
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'manager' | 'mechanic' | null>(null);
  const [shopId, setShopId] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [businessName, setBusinessName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Step 1: Sign Up
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError || !signUpData.user) {
      alert('Sign-up failed: ' + signUpError?.message);
      setLoading(false);
      return;
    }

    const user = signUpData.user;

    // Step 2: Save Profile
    const payload: Database['public']['Tables']['profiles']['Insert'] = {
      id: user.id,
      full_name: fullName,
      phone,
      role,
      shop_id: shopId,
      shop_name: shopName,
      business_name: businessName,
      plan: 'free',
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' });

    if (profileError) {
      alert('Profile update failed: ' + profileError.message);
      setLoading(false);
      return;
    }

    // Step 3: Send Confirmation Email via Edge Function
    try {
      const res = await fetch('/api/send-confirmation-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        throw new Error('Failed to send confirmation email');
      }

      alert('Account created! Please check your email to confirm.');
    } catch (err: any) {
      alert('Error sending confirmation email: ' + err.message);
    }

    setLoading(false);
    router.push('/sign-in');
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-blackops text-orange-500 mb-6">Create Free Account</h1>
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <input type="email" placeholder="Email" className="w-full p-3 rounded bg-neutral-800 text-white" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" className="w-full p-3 rounded bg-neutral-800 text-white" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input type="text" placeholder="Full Name" className="w-full p-3 rounded bg-neutral-800 text-white" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input type="tel" placeholder="Phone Number" className="w-full p-3 rounded bg-neutral-800 text-white" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input type="text" placeholder="Business Name" className="w-full p-3 rounded bg-neutral-800 text-white" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        <input type="text" placeholder="Shop Name" className="w-full p-3 rounded bg-neutral-800 text-white" value={shopName} onChange={(e) => setShopName(e.target.value)} />
        <select className="w-full p-3 rounded bg-neutral-800 text-white" value={role ?? ''} onChange={(e) => setRole(e.target.value as any)} required>
          <option value="">Select Role</option>
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="mechanic">Mechanic</option>
        </select>
        <button type="submit" disabled={loading} className="w-full p-3 bg-orange-500 hover:bg-orange-600 rounded text-white font-bold">
          {loading ? 'Creating Account...' : 'Save & Continue'}
        </button>
      </form>
    </div>
  );
}