'use client';

import { useEffect, useState } from 'react';

export type VehicleInfo = {
  year: string;
  make: string;
  model: string;
  vin?: string;
  plate?: string;
};

const LOCAL_STORAGE_KEY = 'selectedVehicle';

const useVehicleInfo = () => {
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);

  // Load from localStorage on first render
  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setVehicleInfo(parsed);
        console.log('[VehicleInfo] Loaded from localStorage:', parsed);
      } catch (error) {
        console.error('Failed to parse stored vehicle info:', error);
      }
    }
  }, []);

  // Save to localStorage whenever it changes
  useEffect(() => {
    if (vehicleInfo) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(vehicleInfo));
      console.log('[VehicleInfo] Updated localStorage:', vehicleInfo);
    }
  }, [vehicleInfo]);

  const updateVehicle = (newInfo: VehicleInfo) => {
    setVehicleInfo(newInfo);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newInfo));
    console.log('[VehicleInfo] Set new vehicle:', newInfo);
  };

  const clearVehicle = () => {
    setVehicleInfo(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    console.log('[VehicleInfo] Cleared vehicle info');
  };

  return { vehicleInfo, updateVehicle, clearVehicle };
};

export default useVehicleInfo;