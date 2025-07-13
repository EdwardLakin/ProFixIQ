'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); // wait for token check
  const [sessionReady, setSessionReady] = useState(false);

  // Step 1: Read access_token from URL hash and set session
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.substring(1));
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');

    if (access_token && refresh_token) {
      supabase.auth
        .setSession({
          access_token,
          refresh_token,
        })
        .then(({ error }) => {
          if (error) {
            console.error('Session error:', error.message);
            setError('Invalid or expired link. Please request a new one.');
          } else {
            setSessionReady(true);
          }
          setLoading(false);
        });
    } else {
      setError('Missing token. Please request a new link.');
      setLoading(false);
    }
  }, []);

  // Step 2: Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setConfirmed(true);
      setTimeout(() => router.push('/sign-in'), 2500);
    }
  };

  // Step 3: Render
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-neutral-900 p-6 rounded shadow-lg border border-orange-500">
        <h1 className="text-2xl font-blackops text-orange-500 text-center mb-4">Reset Password</h1>

        {loading ? (
          <p className="text-center text-orange-400">Loading…</p>
        ) : confirmed ? (
          <p className="text-green-400 text-center">Password updated! Redirecting…</p>
        ) : error ? (
          <p className="text-red-500 text-center">{error}</p>
        ) : sessionReady ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              required
            />
            <button
              type="submit"
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded"
            >
              Set New Password
            </button>
          </form>
        ) : (
          <p className="text-red-400 text-center">Unauthorized or expired session.</p>
        )}
      </div>
    </div>
  );
}