'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function SignInPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('User not found after sign-in.');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !profile.role) {
      setError('User profile not found.');
      return;
    }

    const role = profile.role ?? '';

    // Store role in cookie
    document.cookie = `role=${role}; path=/`;

    // Redirect based on role
    if (role === 'owner') {
  router.push('/dashboard/owner');
} else if (role === 'admin') {
  router.push('/dashboard/admin');
} else if (role === 'manager') {
  router.push('/dashboard/manager');
} else if (role === 'advisor') {
  router.push('/dashboard/advisor');
} else if (role === 'mechanic') {
  router.push('/dashboard/tech');
}

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">Sign In</h1>

      <form onSubmit={handleSignIn} className="w-full max-w-md space-y-4">
        <input
          type="email"
          required
          placeholder="Email"
          className="w-full p-2 rounded bg-gray-900 text-white border border-orange-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          placeholder="Password"
          className="w-full p-2 rounded bg-gray-900 text-white border border-orange-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          Sign In
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <p className="mt-4 text-sm text-orange-400">
        <a href="/forgot-password" className="underline hover:text-orange-300">
          Forgot Password?
        </a>
      </p>

      <hr className="my-6 w-full max-w-md border-t border-gray-700" />

      <button
        onClick={handleGoogleSignIn}
        className="w-full max-w-md bg-white text-black font-bold py-2 px-4 rounded hover:bg-gray-200"
      >
        Sign in with Google
      </button>

      <button
        onClick={() => router.push('/')}
        className="mt-6 text-orange-400 underline"
      >
        Back to Home
      </button>
    </div>
  );
}}