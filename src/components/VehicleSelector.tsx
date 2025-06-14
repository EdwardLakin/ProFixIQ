'use client';

import React from 'react';
import { useVehicleInfo } from '@/hooks/useVehicleInfo';

export default function VehicleSelector() {
  const { vehicle, setVehicle } = useVehicleInfo();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setVehicle({ ...vehicle, [name]: value });
  };

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-muted mb-2">Select Vehicle</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <input
          type="text"
          name="year"
          value={vehicle.year || ''}
          onChange={handleChange}
          placeholder="Year"
          className="input"
        />
        <input
          type="text"
          name="make"
          value={vehicle.make || ''}
          onChange={handleChange}
          placeholder="Make"
          className="input"
        />
        <input
          type="text"
          name="model"
          value={vehicle.model || ''}
          onChange={handleChange}
          placeholder="Model"
          className="input"
        />
      </div>
    </div>
  );
}