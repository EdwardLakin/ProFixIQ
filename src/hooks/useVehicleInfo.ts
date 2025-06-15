'use client';

import { useState, useEffect } from 'react';

export type VehicleInfo = {
  year: string;
  make: string;
  model: string;
  vin?: string;
  plate?: string;
};

const LOCAL_STORAGE_KEY = 'selectedVehicle';

export const useVehicleInfo = () => {
  const [vehicleInfo, setVehicleInfo] = useState<VehicleInfo | null>(null);

  // Load vehicle from localStorage on first load
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

  // Save to localStorage whenever it changes
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