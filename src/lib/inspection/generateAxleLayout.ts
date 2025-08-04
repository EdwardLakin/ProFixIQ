// lib/inspection/generateAxleLayout.ts

import type { AxleInspection } from './axleTypes';

export function generateAxleLayout(vehicleType: 'car' | 'truck' | 'bus' | 'trailer'): AxleInspection[] {
  const hasAirBrakes = vehicleType !== 'car';

  const baseAxle = (label: string): AxleInspection => ({
    axleLabel: label,
    brakeType: hasAirBrakes ? 'air' : 'hydraulic',
    left: {
      drumOrRotor: '',
      liningPadThickness: null,
      pushRodTravel: hasAirBrakes ? null : undefined,
      tirePressure: null,
      treadDepth: null,
    },
    right: {
      drumOrRotor: '',
      liningPadThickness: null,
      pushRodTravel: hasAirBrakes ? null : undefined,
      tirePressure: null,
      treadDepth: null,
    },
    wheelTorqueInner: null,
    wheelTorqueOuter: null,
    parkBrakeLining: hasAirBrakes ? null : undefined,
  });

  const configMap: Record<string, string[]> = {
    car: ['Front', 'Rear'],
    truck: ['Steer', 'Drive 1', 'Drive 2'],
    bus: ['Steer', 'Drive 1', 'Drive 2'],
    trailer: ['Trailer 1', 'Trailer 2', 'Trailer 3'],
  };

  return configMap[vehicleType].map(baseAxle);
}