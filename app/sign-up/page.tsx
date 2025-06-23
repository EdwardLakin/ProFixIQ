'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      router.push('/');
    }

    setLoading(false);
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 bg-black text-white">
      <div className="animate-pulse mb-8 text-4xl font-black tracking-wide text-orange-500">
        ProFixIQ
      </div>

      <form
        onSubmit={handleSignUp}
        className="bg-neutral-900 bg-opacity-60 border border-neutral-700 p-6 rounded w-full max-w-md space-y-4"
      >
        <h2 className="text-2xl font-bold mb-2 text-center">Create an Account</h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="input"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input"
        />

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 rounded"
          disabled={loading}
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>

        <div className="text-center text-sm text-neutral-400">or</div>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          className="w-full bg-white text-black py-2 rounded font-semibold hover:bg-neutral-200"
        >
          Sign Up with Google
        </button>

        <p className="text-sm text-center text-neutral-400 mt-4">
          Already have an account?{' '}
          <Link href="/sign-in" className="text-orange-500 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}