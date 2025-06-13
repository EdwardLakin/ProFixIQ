'use client';

import React, { useState, useEffect } from 'react';
import { useVehicleInfo } from '../hooks/useVehicleInfo';

const years = Array.from({ length: 31 }, (_, i) => 2025 - i);
const makes = ['Ford', 'Chevrolet', 'Toyota', 'Honda', 'Dodge', 'Nissan']; // Extend as needed

export default function VehicleSelector() {
  const { vehicle, setVehicle } = useVehicleInfo();
  const [localVehicle, setLocalVehicle] = useState({
    year: vehicle?.year ?? '',
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
  });

  useEffect(() => {
    if (vehicle) {
      setLocalVehicle({
        year: vehicle.year ?? '',
        make: vehicle.make ?? '',
        model: vehicle.model ?? '',
      });
    }
  }, [vehicle]);

  const handleChange = (field: string, value: string) => {
    const updated = { ...localVehicle, [field]: value };
    setLocalVehicle(updated);
    setVehicle(updated); // update global context
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={localVehicle.year}
          onChange={e => handleChange('year', e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">Year</option>
          {years.map(year => (
            <option key={year}>{year}</option>
          ))}
        </select>

        <select
          value={localVehicle.make}
          onChange={e => handleChange('make', e.target.value)}
          className="border p-2 rounded"
        >
          <option value="">Make</option>
          {makes.map(make => (
            <option key={make}>{make}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Model"
          value={localVehicle.model}
          onChange={e => handleChange('model', e.target.value)}
          className="border p-2 rounded w-full"
        />
      </div>
    </div>
  );
}