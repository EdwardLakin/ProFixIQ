'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function AuthPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const toggleMode = () => {
    setMode((prev) => (prev === 'sign-in' ? 'sign-up' : 'sign-in'));
    setError('');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'sign-in') {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.push('/auth/callback');
    } else {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      router.push('/onboarding');
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-4 font-blackops">
      <h1 className="text-3xl mb-6 text-orange-500">
        {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
      </h1>

      <form onSubmit={handleAuth} className="w-full max-w-md space-y-4">
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
          {mode === 'sign-in' ? 'Sign In' : 'Sign Up'}
        </button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>

      <button
        onClick={toggleMode}
        className="mt-4 text-orange-400 underline text-sm"
      >
        {mode === 'sign-in'
          ? "Don't have an account? Sign Up"
          : 'Already have an account? Sign In'}
      </button>

      {mode === 'sign-in' && (
        <p className="mt-2 text-sm text-orange-400">
          <a href="/forgot-password" className="underline hover:text-orange-300">
            Forgot Password?
          </a>
        </p>
      )}

      <hr className="my-6 w-full max-w-md border-t border-gray-700" />

      <button
        onClick={handleGoogle}
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
}