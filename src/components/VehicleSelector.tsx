'use client';

import React from 'react';
import { useVehicleInfo } from '../hooks/useVehicleInfo';

export default function VehicleSelector() {
  const { vehicle, setVehicle } = useVehicleInfo();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setVehicle({
      ...vehicle,
      [name]: value,
    } as any);
  };

  return (
    <div className="mb-4 space-y-2">
      <h3 className="font-semibold">Vehicle Info</h3>
      <input
        type="text"
        name="year"
        placeholder="Year"
        value={vehicle?.year || ''}
        onChange={handleChange}
        className="w-full p-2 border rounded"
      />
      <input
        type="text"
        name="make"
        placeholder="Make"
        value={vehicle?.make || ''}
        onChange={handleChange}
        className="w-full p-2 border rounded"
      />
      <input
        type="text"
        name="model"
        placeholder="Model"
        value={vehicle?.model || ''}
        onChange={handleChange}
        className="w-full p-2 border rounded"
      />
    </div>
  );
}