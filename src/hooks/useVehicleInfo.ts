// hooks/useVehicleInfo.ts
import { useState, useEffect } from 'react';

export function useVehicleInfo() {
  const [vehicle, setVehicle] = useState<any>(null);

  useEffect(() => {
    const storedId = localStorage.getItem('selectedVehicleId');
    const storedVehicle = localStorage.getItem('selectedVehicleData');
    if (storedId && storedVehicle) {
      setVehicle(JSON.parse(storedVehicle));
    }
  }, []);

  const setVehicleContext = (v: any) => {
    localStorage.setItem('selectedVehicleId', v.id);
    localStorage.setItem('selectedVehicleData', JSON.stringify(v));
    setVehicle(v);
  };

  return { vehicle, setVehicle: setVehicleContext };
}