'use client';

import { useState } from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';

export default function VINPage() {
  const { setVehicle } = useVehicleInfo();
  const [vin, setVin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDecode = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/vin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vin }),
      });

      const data = await res.json();
      if (res.ok) {
        setVehicle(data);
      } else {
        setError(data.error || 'VIN decode failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to decode VIN.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Decode Vehicle VIN</h1>
      <input
        type="text"
        placeholder="Enter VIN"
        value={vin}
        onChange={(e) => setVin(e.target.value)}
        className="border p-2 w-full rounded"
      />
      <button
        onClick={handleDecode}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {loading ? 'Decoding...' : 'Decode VIN'}
      </button>
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}