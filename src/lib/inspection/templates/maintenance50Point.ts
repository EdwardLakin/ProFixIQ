import type { InspectionState, InspectionResult } from '@lib/inspection/types';

const empty: InspectionResult = {
  status: 'ok',
  notes: [],
};

export function createMaintenance50PointInspection(): InspectionState {
  return {
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sections: {
      'Engine Bay': {
        'Engine Oil': { ...empty },
        'Oil Filter': { ...empty },
        'Air Filter': { ...empty },
        'Cabin Air Filter': { ...empty },
        'Coolant Level': { ...empty },
        'Brake Fluid Level': { ...empty },
        'Transmission Fluid Level': { ...empty },
        'Battery Terminals': { ...empty },
        'Belts': { ...empty },
        'Hoses': { ...empty },
      },
      'Brakes': {
        'Front Brake Pads': { ...empty },
        'Rear Brake Pads': { ...empty },
        'Brake Rotors': { ...empty },
        'Brake Lines': { ...empty },
        'Brake Fluid Condition': { ...empty },
      },
      'Tires': {
        'Tire Tread Depth': { ...empty },
        'Tire Pressure': { ...empty },
        'Spare Tire': { ...empty },
        'Wheel Condition': { ...empty },
        'Valve Stems': { ...empty },
      },
      'Lights & Signals': {
        'Headlights': { ...empty },
        'Brake Lights': { ...empty },
        'Reverse Lights': { ...empty },
        'Turn Signals': { ...empty },
        'License Plate Light': { ...empty },
      },
      'Interior': {
        'Horn': { ...empty },
        'Windshield Wipers': { ...empty },
        'Washer Fluid': { ...empty },
        'Heater Operation': { ...empty },
        'AC Operation': { ...empty },
        'Cabin Air Filter': { ...empty },
        'Check Engine Light': { ...empty },
        'Warning Lights': { ...empty },
      },
      'Undercarriage': {
        'Suspension Components': { ...empty },
        'Steering Linkages': { ...empty },
        'CV Boots': { ...empty },
        'Exhaust System': { ...empty },
        'Driveline': { ...empty },
        'Oil Leaks': { ...empty },
        'Transmission Leaks': { ...empty },
        'Differential Leaks': { ...empty },
      },
      'Fluids': {
        'Engine Oil': { ...empty },
        'Coolant': { ...empty },
        'Transmission Fluid': { ...empty },
        'Brake Fluid': { ...empty },
        'Power Steering Fluid': { ...empty },
        'Windshield Washer Fluid': { ...empty },
      },
      'Service Items': {
        'Oil Change': { ...empty },
        'Oil Filter Change': { ...empty },
        'Reset Maintenance Light': { ...empty },
        'Top Off Fluids': { ...empty },
        'Inspect for Recalls': { ...empty },
      },
    },
  };
}