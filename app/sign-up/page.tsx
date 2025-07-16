'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';

const supabase = createBrowserSupabaseClient();

export default function SignUp() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    setError(error.message);
  } else {
    // Wait a bit for the auth cookie to be set
    setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const redirect = params.get('redirectedFrom') || '/';
      router.push(redirect);
    }, 500); // 500ms delay ensures cookie is set
  }

  setLoading(false);
};

  const handleGoogleSignUp = async () => {
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
        <h1 className="text-4xl text-center font-blackops text-orange-500">Sign Up</h1>

        <form onSubmit={handleSignUp} className="space-y-4">
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
            {loading ? 'Signing Up...' : 'Sign Up'}
          </button>
        </form>

        <button
          onClick={handleGoogleSignUp}
          className="w-full py-2 rounded border border-white hover:bg-white hover:text-black transition-all font-blackops text-lg"
        >
          Sign Up with Google
        </button>

        <Link
          href="/"
          className="block mt-4 text-center text-orange-400 hover:underline"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}