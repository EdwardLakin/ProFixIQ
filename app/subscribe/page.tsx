'use client';

import { useState } from 'react';

export default function SubscribePage() {
  const [email, setEmail] = useState('');
  const [priceId, setPriceId] = useState(''); // set default if desired
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, priceId }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error || 'Checkout failed.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <form onSubmit={handleCheckout} className="max-w-md w-full space-y-4 bg-gray-900 p-6 rounded border border-orange-500">
        <h1 className="text-xl font-bold text-orange-400">Subscribe to a Plan</h1>

        <input
          type="email"
          required
          placeholder="Your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-400"
        />

        <select
          required
          value={priceId}
          onChange={(e) => setPriceId(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-400"
        >
          <option value="">Select a plan</option>
          <option value="price_123_DIY">DIY - $9</option>
          <option value="price_456_PRO">Pro - $49</option>
          <option value="price_789_PLUS">Pro+ - $99</option>
        </select>

        <button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-black py-2 px-4 rounded w-full">
          {loading ? 'Redirecting...' : 'Continue to Checkout'}
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </form>
    </div>
  );
}