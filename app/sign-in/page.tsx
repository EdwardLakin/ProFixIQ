'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseClient';

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <form onSubmit={handleSignIn} className="bg-white bg-opacity-5 p-8 rounded-xl shadow-xl w-full max-w-md">
        <h2 className="text-3xl font-black text-center mb-6 font-blackops">Welcome Back</h2>

        <label className="block mb-4">
          <span className="text-sm text-gray-300">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mt-1 p-2 rounded bg-gray-800 text-white border border-gray-600"
          />
        </label>

        <label className="block mb-6">
          <span className="text-sm text-gray-300">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mt-1 p-2 rounded bg-gray-800 text-white border border-gray-600"
          />
        </label>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 font-blackops bg-orange-500 hover:bg-orange-600 transition rounded text-black"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>

        <div className="my-4 text-center text-sm text-gray-400">or</div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full py-2 font-blackops bg-white text-black hover:bg-gray-200 rounded"
        >
          Continue with Google
        </button>
      </form>
    </div>
  );
}