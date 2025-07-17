'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function SignUpPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Optional: Redirect to callback immediately
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      router.push('/onboarding');
    }
  };

  const handleGoogleSignUp = async () => {
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
      <h1 className="text-3xl mb-6 text-orange-500">Create Account</h1>

      <form onSubmit={handleSignUp} className="w-full max-w-md space-y-4">
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
          Sign Up
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <hr className="my-6 w-full max-w-md border-t border-gray-700" />

      <button
        onClick={handleGoogleSignUp}
        className="w-full max-w-md bg-white text-black font-bold py-2 px-4 rounded hover:bg-gray-200"
      >
        Sign up with Google
      </button>

      <button
        onClick={() => router.push('/sign-in')}
        className="mt-6 text-orange-400 underline"
      >
        Already have an account? Sign In
      </button>
    </div>
  );
}