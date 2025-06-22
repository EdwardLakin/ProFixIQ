'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/');
    });
  }, [router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    else router.push('/');
  };

  const handleGoogleSignUp = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-neutral-900 p-6 rounded shadow-lg border border-orange-500">
        {/* Animated Pulse Logo and Header */}
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="h-12 w-12 rounded-full bg-orange-500 animate-pulse mb-2" />
          <h1 className="text-4xl font-blackops text-orange-500">ProFixIQ</h1>
          <p className="text-sm text-neutral-400">Create your account</p>
        </div>

        <form onSubmit={handleSignUp} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded"
          >
            Sign Up
          </button>
        </form>

        <div className="my-4 text-center text-neutral-400">or</div>

        <button
          onClick={handleGoogleSignUp}
          className="w-full bg-white text-black py-2 rounded hover:bg-neutral-200"
        >
          Continue with Google
        </button>

        <p className="mt-4 text-center text-sm text-neutral-400">
          Already have an account?{' '}
          <a href="/sign-in" className="text-orange-400 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}