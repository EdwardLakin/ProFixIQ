'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabaseClient';
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

    const { error, data: signUpData } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const user = signUpData?.user;

    if (user) {
      const { error: profileError } = await supabase.from('profiles').insert([
        {
          id: user.id,
          email: user.email,
          plan: 'diy', // default
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ]);

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

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
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="animate-pulse mb-8 text-4xl font-black tracking-widest text-white">
        ProFixIQ
      </div>

      <form
        onSubmit={handleSignUp}
        className="w-full max-w-md bg-neutral-900 bg-opacity-60 p-6 rounded-lg shadow-lg"
      >
        <h2 className="text-2xl font-bold mb-4 text-center text-white">
          Create an Account
        </h2>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="input mb-4"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input mb-4"
        />

        {error && (
          <p className="text-red-500 text-sm mb-4 text-center">{error}</p>
        )}

        <button
          type="submit"
          className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 rounded"
          disabled={loading}
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>

        <div className="text-center text-sm text-neutral-400 mt-4">or</div>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          className="w-full bg-white text-black py-2 rounded font-semibold mt-2"
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