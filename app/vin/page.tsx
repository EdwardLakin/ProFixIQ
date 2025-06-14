'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useUser } from '@/hooks/useUser';

export default function VinDecoderPage() {
  const supabase = createBrowserClient();
  const { user } = useUser();
  const [vin, setVin] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const decodeVIN = async () => {
    if (!vin || vin.length < 5) return alert('Enter valid VIN (min 5 chars)');
    setLoading(true);
    const res = await fetch('/api/vin/decode', {
      method: 'POST',
      body: JSON.stringify({ vin, user_id: user?.id }),
    });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">VIN Decoder</h1>
      <input
        value={vin}
        onChange={(e) => setVin(e.target.value)}
        placeholder="Enter VIN"
        className="w-full p-2 border rounded mb-4"
      />
      <button onClick={decodeVIN} className="bg-blue-600 text-white px-4 py-2 rounded">
        {loading ? 'Decoding...' : 'Decode VIN'}
      </button>

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded">
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}