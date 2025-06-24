import { InspectionState } from '@/lib/inspection/types';

export function createMaintenance50PointInspection(): InspectionState {
  const now = new Date().toISOString();

  const items = (items: string[]) =>
    Object.fromEntries(items.map((item) => [item, { status: 'ok' }]));

  return {
    startedAt: now,
    updatedAt: now,
    paused: false,
    sections: {
      'Engine Bay': items([
        'Engine Oil',
        'Oil Filter',
        'Air Filter',
        'Cabin Air Filter',
        'Coolant Level',
        'Brake Fluid Level',
        'Transmission Fluid Level',
        'Battery Terminals',
        'Belts',
        'Hoses',
      ]),
      'Brakes': items([
        'Front Brake Pads',
        'Rear Brake Pads',
        'Brake Rotors',
        'Brake Lines',
        'Brake Fluid Condition',
      ]),
      'Tires': items([
        'Tire Tread Depth',
        'Tire Pressure',
        'Spare Tire',
        'Wheel Condition',
        'Valve Stems',
      ]),
      'Lights & Signals': items([
        'Headlights',
        'Brake Lights',
        'Reverse Lights',
        'Turn Signals',
        'License Plate Light',
      ]),
      'Interior': items([
        'Horn',
        'Windshield Wipers',
        'Washer Fluid',
        'Heater Operation',
        'AC Operation',
        'Cabin Air Filter',
        'Check Engine Light',
        'Warning Lights',
      ]),
      'Undercarriage': items([
        'Suspension Components',
        'Steering Linkages',
        'CV Boots',
        'Exhaust System',
        'Driveline',
        'Oil Leaks',
        'Transmission Leaks',
        'Differential Leaks',
      ]),
      'Fluids': items([
        'Engine Oil',
        'Coolant',
        'Transmission Fluid',
        'Brake Fluid',
        'Power Steering Fluid',
        'Windshield Washer Fluid',
      ]),
      'Service Items': items([
        'Oil Change',
        'Oil Filter Change',
        'Reset Maintenance Light',
        'Top Off Fluids',
        'Inspect for Recalls',
      ]),
    },
  } as InspectionState;
}