'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface VehicleInfo {
  year: string;
  make: string;
  model: string;
}

type VehicleContextType = {
  vehicle: VehicleInfo | null;
  setVehicle: (vehicle: VehicleInfo) => void;
};

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider = ({ children }: { children: ReactNode }) => {
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);

  return (
    <VehicleContext.Provider value={{ vehicle, setVehicle }}>
      {children}
    </VehicleContext.Provider>
  );
};

export const useVehicleInfo = () => {
  const context = useContext(VehicleContext);
  if (!context) {
    throw new Error('useVehicleInfo must be used within a VehicleProvider');
  }
  return context;
};