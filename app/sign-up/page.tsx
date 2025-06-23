'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import supabase from '@/lib/supabaseClient';

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

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const user = data.user;
    if (user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        plan: 'DIY', // default
      });

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      router.push('/onboarding/plan');
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white px-4">
      <div className="animate-pulse mb-8 text-4xl font-black tracking-wider text-orange-500">ProFixIQ</div>

      <form onSubmit={handleSignUp} className="bg-neutral-900 bg-opacity-60 border border-neutral-700 rounded p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-2 text-center">Create an Account</h2>

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
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded mt-4"
        >
          {loading ? 'Signing up...' : 'Sign Up'}
        </button>

        <div className="text-center text-sm text-neutral-400 my-4">or</div>

        <button
          type="button"
          onClick={handleGoogleSignUp}
          className="w-full bg-white text-black py-2 px-4 rounded font-semibold"
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