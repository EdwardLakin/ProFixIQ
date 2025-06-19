// hooks/useVehicleInfo.ts
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

export type Vehicle = {
  year: string;
  make: string;
  model: string;
  vin?: string;
  plate?: string;
} | null;

type VehicleContextType = {
  vehicle: Vehicle;
  setVehicle: (vehicle: Vehicle) => void;
  clearVehicle: () => void;
};

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export function VehicleProvider({ children }: { children: ReactNode }) {
  const [vehicle, setVehicle] = useState<Vehicle>(null);

  const clearVehicle = () => {
    setVehicle(null);
  };

  return (
    <VehicleContext.Provider value={{ vehicle, setVehicle, clearVehicle }}>
      {children}
    </VehicleContext.Provider>
  );
}

export default function useVehicleInfo() {
  const context = useContext(VehicleContext);
  if (!context) {
    throw new Error('useVehicleInfo must be used within a VehicleProvider');
  }
  return context;
}