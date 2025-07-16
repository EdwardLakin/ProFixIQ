'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@lib/supabaseClient';

export default function SignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectedFrom') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setTimeout(() => {
      window.location.href = redirectTo;
    }, 300);

    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });

    if (error) {
      setError(error.message);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      <div className="max-w-md w-full space-y-6 border border-orange-500 p-8 rounded-xl backdrop-blur-md bg-black/30">
        <h1 className="text-4xl text-center font-blackops text-orange-500">Sign In</h1>

        <form onSubmit={handleSignIn} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input"
            required
          />

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            className="w-full py-2 rounded bg-orange-500 hover:bg-orange-600 font-blackops text-lg transition-all"
            disabled={loading}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <button
          onClick={handleGoogleSignIn}
          className="w-full py-2 rounded border border-white hover:bg-white hover:text-black transition-all font-blackops text-lg"
        >
          Sign In with Google
        </button>

        <div className="mt-4 space-y-1">
          <Link href="/forgot-password" className="block text-center text-sm text-orange-400 hover:underline">
            Forgot Password?
          </Link>
          <Link href="/" className="block text-center text-orange-400 hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}