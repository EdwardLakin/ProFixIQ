'use client';

import React from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';

export default function VehicleSelector() {
  const { vehicleInfo, updateVehicle } = useVehicleInfo();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // fallback in case vehicleInfo is null
    const newVehicle = {
      year: vehicleInfo?.year || '',
      make: vehicleInfo?.make || '',
      model: vehicleInfo?.model || '',
      [name]: value,
    };

    updateVehicle(newVehicle);
  };

  return (
    <div className="mb-4 space-y-2">
      <h3 className="font-semibold text-accent">Vehicle Info</h3>

      <input
        type="text"
        name="year"
        placeholder="Year"
        value={vehicleInfo?.year || ''}
        onChange={handleChange}
        className="w-full p-2 border rounded"
      />
      <input
        type="text"
        name="make"
        placeholder="Make"
        value={vehicleInfo?.make || ''}
        onChange={handleChange}
        className="w-full p-2 border rounded"
      />
      <input
        type="text"
        name="model"
        placeholder="Model"
        value={vehicleInfo?.model || ''}
        onChange={handleChange}
        className="w-full p-2 border rounded"
      />
    </div>
  );
}