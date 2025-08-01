import { useEffect, useState } from 'react';

export type VehicleInfo = {
  id: string;
  year: string;
  make: string;
  model: string;
  engine: string;
  plate?: string;
};

const LOCAL_STORAGE_KEY = 'selectedVehicle';

const useVehicleInfo = () => {
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setVehicleInfo(parsed);
      } catch (error) {
        console.error('Failed to parse stored vehicle info:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (vehicleInfo) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(vehicleInfo));
    }
  }, [vehicleInfo]);

  const updateVehicle = (newInfo: VehicleInfo) => {
    setVehicleInfo(newInfo);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newInfo));
  };

  const clearVehicle = () => {
    setVehicleInfo(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  return { vehicleInfo, updateVehicle, clearVehicle };
};

export default useVehicleInfo;