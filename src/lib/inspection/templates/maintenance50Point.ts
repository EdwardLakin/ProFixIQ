// lib/inspection/templates/maintenance50Point.ts

import { InspectionTemplate } from '@lib/inspection/types';

const maintenance50Point: InspectionTemplate = {
  name: '50-Point Maintenance Inspection',
  sections: [
    {
      title: 'Fluids',
      items: [
        'Engine Oil',
        'Coolant',
        'Brake Fluid',
        'Transmission Fluid',
        'Power Steering Fluid',
        'Windshield Washer Fluid',
      ],
    },
    {
      title: 'Filters',
      items: [
        'Engine Air Filter',
        'Cabin Air Filter',
        'Fuel Filter',
        'Oil Filter',
      ],
    },
    {
      title: 'Brakes',
      items: [
        'Front Brake Pads',
        'Rear Brake Pads',
        'Rotors',
        'Brake Lines',
        'Brake Calipers',
      ],
    },
    {
      title: 'Tires & Suspension',
      items: [
        'Tire Tread Depth',
        'Tire Pressure',
        'Suspension Bushings',
        'Shocks/Struts',
        'Wheel Bearings',
        'Alignment (Visual)',
      ],
    },
    {
      title: 'Battery & Charging',
      items: [
        'Battery Terminals',
        'Battery Voltage',
        'Alternator Belt',
        'Starter Function',
      ],
    },
    {
      title: 'Lighting & Electrical',
      items: [
        'Headlights',
        'Brake Lights',
        'Turn Signals',
        'Interior Lights',
        'Horn',
        'Power Windows/Locks',
      ],
    },
    {
      title: 'Belts & Hoses',
      items: [
        'Serpentine Belt',
        'Radiator Hoses',
        'Heater Hoses',
        'Vacuum Lines',
      ],
    },
    {
      title: 'Underbody & Exterior',
      items: [
        'Leaks (Oil/Coolant)',
        'Exhaust System',
        'Frame Rust',
        'Body Damage',
        'Wiper Blades',
      ],
    },
    {
      title: 'HVAC System',
      items: [
        'Heater Operation',
        'AC Operation',
        'Cabin Ventilation',
      ],
    },
  ],
};

export default maintenance50Point;