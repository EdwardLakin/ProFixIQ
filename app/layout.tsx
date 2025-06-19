'use client';

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  Dispatch,
  SetStateAction,
} from 'react';

interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  vin?: string;
}

interface VehicleContextType {
  vehicleInfo: VehicleInfo | null;
  setVehicleInfo: Dispatch<SetStateAction<VehicleInfo | null>>;
  clearVehicleInfo: () => void;
}

const VehicleContext = createContext<VehicleContextType | undefined>(undefined);

export const VehicleProvider = ({ children }: { children: ReactNode }) => {
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);

  const clearVehicleInfo = () => {
    setVehicleInfo(null);
  };

  return (
    <VehicleContext.Provider value={{ vehicleInfo, setVehicleInfo, clearVehicleInfo }}>
      {children}
    </VehicleContext.Provider>
  );
};

const useVehicleInfo = () => {
  const context = useContext(VehicleContext);
  if (!context) {
    throw new Error('useVehicleInfo must be used within a VehicleProvider');
  }
  return context;
};

export default useVehicleInfo;