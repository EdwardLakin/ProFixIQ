// app/context/useVehicleInfo.tsx
'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type VehicleInfo = {
  year: string;
  make: string;
  model: string;
  vin?: string;
};

type VehicleContextType = {
  vehicleInfo: VehicleInfo | null;
  setVehicleInfo: (info: VehicleInfo) => void;
  clearVehicleInfo: () => void;
};

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider = ({ children }: { children: ReactNode }) => {
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);

  const clearVehicleInfo = () => setVehicleInfo(null);

  return (
    <VehicleContext.Provider value={{ vehicleInfo, setVehicleInfo, clearVehicleInfo }}>
      {children}
    </VehicleContext.Provider>
  );
};

export default function useVehicleInfo() {
  const context = useContext(VehicleContext);
  if (!context) {
    throw new Error('useVehicleInfo must be used within a VehicleProvider');
  }
  return context;
}