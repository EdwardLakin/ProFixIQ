'use client';

import React from 'react';
import TechBot from '../../../src/components/TechBot';
import VehicleSelector from '../../../src/components/VehicleSelector';

export default function AIChatPage() {
  return (
    <div className="p-4">
      <VehicleSelector />
      <TechBot />
    </div>
  );
}