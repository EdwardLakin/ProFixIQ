'use client';

import React from 'react';
import useVehicleInfo from '@/hooks/useVehicleInfo';

export default function VehicleSelector() {
  const { vehicleInfo, updateVehicle } = useVehicleInfo();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    updateVehicle({
      ...vehicleInfo,
      [name]: value,
    });
  };

  return (
    <div className="mb-6 space-y-4 text-left">
      <h3 className="font-header text-xl text-accent font-bold">🚗 Vehicle Info</h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <input
          type="text"
          name="year"
          placeholder="Year"
          value={vehicleInfo?.year || ''}
          onChange={handleChange}
          className="w-full p-3 rounded-md bg-surface border border-neutral-700 text-white placeholder:text-neutral-400"
        />
        <input
          type="text"
          name="make"
          placeholder="Make"
          value={vehicleInfo?.make || ''}
          onChange={handleChange}
          className="w-full p-3 rounded-md bg-surface border border-neutral-700 text-white placeholder:text-neutral-400"
        />
        <input
          type="text"
          name="model"
          placeholder="Model"
          value={vehicleInfo?.model || ''}
          onChange={handleChange}
          className="w-full p-3 rounded-md bg-surface border border-neutral-700 text-white placeholder:text-neutral-400"
        />
      </div>
    </div>
  );
}