'use client';

import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError('');

    const res = await fetch('/api/send-reset', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.ok) {
      setStatus('sent');
    } else {
      const { error } = await res.json();
      setError(error || 'Something went wrong.');
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-blackops p-4">
      <h1 className="text-3xl mb-4 text-orange-500">Forgot Password</h1>

      {status === 'sent' ? (
        <p className="text-green-500">Password reset email sent!</p>
      ) : (
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 bg-gray-900 text-white border border-orange-500 rounded"
            placeholder="Enter your email"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
          >
            {status === 'sending' ? 'Sending...' : 'Send Reset Link'}
          </button>
          {status === 'error' && <p className="text-red-500">{error}</p>}
        </form>
      )}

      <button
        className="mt-6 text-orange-400 underline"
        onClick={() => (window.location.href = '/sign-in')}
      >
        Back to Sign In
      </button>
    </div>
  );
}