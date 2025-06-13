'use client';

import React, { useState, useEffect } from 'react';
import { useVehicleInfo } from '../hooks/useVehicleInfo';

const years = Array.from({ length: 31 }, (_, i) => 2025 - i);
const makes = ['Ford', 'Chevrolet', 'Toyota', 'Honda', 'Dodge', 'Nissan']; // Extend as needed
const modelsByMake: Record<string, string[]> = {
  Ford: ['F-150', 'Escape', 'Fusion'],
  Chevrolet: ['Silverado', 'Malibu', 'Equinox'],
  Toyota: ['Corolla', 'Camry', 'Tacoma'],
  Honda: ['Civic', 'Accord', 'CR-V'],
  Dodge: ['Ram', 'Charger', 'Durango'],
  Nissan: ['Altima', 'Rogue', 'Frontier'],
};

export default function VehicleSelector() {
  const { vehicle, setVehicle } = useVehicleInfo();
  const [localVehicle, setLocalVehicle] = useState(vehicle);

  useEffect(() => {
    setVehicle(localVehicle);
  }, [localVehicle]);

  const updateField = (field: string, value: string) => {
    setLocalVehicle((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="bg-surface shadow-card p-4 rounded mb-6">
      <h2 className="text-lg font-semibold mb-2 text-accent">Select Vehicle</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          className="border p-2 rounded"
          value={localVehicle.year || ''}
          onChange={(e) => updateField('year', e.target.value)}
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="border p-2 rounded"
          value={localVehicle.make || ''}
          onChange={(e) => {
            updateField('make', e.target.value);
            updateField('model', ''); // reset model
          }}
        >
          <option value="">Make</option>
          {makes.map((make) => (
            <option key={make} value={make}>{make}</option>
          ))}
        </select>
        <select
          className="border p-2 rounded"
          value={localVehicle.model || ''}
          onChange={(e) => updateField('model', e.target.value)}
          disabled={!localVehicle.make}
        >
          <option value="">Model</option>
          {(modelsByMake[localVehicle.make] || []).map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>
    </div>
  );
}