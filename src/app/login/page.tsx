'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`, // ← update if needed
      },
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setSent(true);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4 bg-surface text-accent">
      <h1 className="text-2xl font-bold mb-4">Login to ProFixIQ</h1>
      <input
        type="email"
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-2 p-2 border rounded text-black w-full max-w-sm"
      />
      <button
        onClick={handleLogin}
        className="bg-accent px-4 py-2 text-white rounded hover:bg-accent/80"
      >
        Send Magic Link
      </button>
      {sent && <p className="mt-4">✅ Check your email to complete login.</p>}
      {errorMsg && <p className="mt-4 text-red-500">{errorMsg}</p>}
    </main>
  );
}