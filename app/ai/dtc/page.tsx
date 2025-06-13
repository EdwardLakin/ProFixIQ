import React from 'react';
import VehicleSelector from '../../../src/components/VehicleSelector';
import DTCCodeLookup from '../../../src/components/DTCCodeLookup';

export default function DTCPage() {
  return (
    <div className="p-4">
      <VehicleSelector />
      <DTCCodeLookup />
    </div>
  );
}