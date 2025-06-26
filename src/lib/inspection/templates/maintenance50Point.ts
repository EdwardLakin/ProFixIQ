import { InspectionTemplate } from '@lib/inspection/types';

const maintenance50Point: InspectionTemplate = {
  templateName: '50-Point Maintenance Inspection',
  sections: [
    {
      title: 'Fluids',
      items: [
        { name: 'Engine Oil' },
        { name: 'Coolant' },
        { name: 'Brake Fluid' },
        { name: 'Transmission Fluid' },
        { name: 'Power Steering Fluid' },
        { name: 'Windshield Washer Fluid' },
      ],
    },
    {
      title: 'Filters',
      items: [
        { name: 'Engine Air Filter' },
        { name: 'Cabin Air Filter' },
        { name: 'Fuel Filter' },
        { name: 'Oil Filter' },
      ],
    },
    {
      title: 'Brakes',
      items: [
        { name: 'Front Brake Pads' },
        { name: 'Rear Brake Pads' },
        { name: 'Rotors' },
        { name: 'Brake Lines' },
        { name: 'Brake Calipers' },
      ],
    },
    {
      title: 'Tires & Suspension',
      items: [
        { name: 'Tire Tread Depth' },
        { name: 'Tire Pressure' },
        { name: 'Suspension Bushings' },
        { name: 'Shocks/Struts' },
        { name: 'Wheel Bearings' },
        { name: 'Alignment (Visual)' },
      ],
    },
    {
      title: 'Battery & Charging',
      items: [
        { name: 'Battery Terminals' },
        { name: 'Battery Voltage' },
        { name: 'Alternator Output' },
        { name: 'Drive Belts' },
      ],
    },
    {
      title: 'Lights & Wipers',
      items: [
        { name: 'Headlights' },
        { name: 'Brake Lights' },
        { name: 'Turn Signals' },
        { name: 'Hazard Lights' },
        { name: 'Windshield Wipers' },
      ],
    },
    {
      title: 'Underbody',
      items: [
        { name: 'Oil Leaks' },
        { name: 'Coolant Leaks' },
        { name: 'Transmission Leaks' },
        { name: 'Exhaust System' },
        { name: 'Rust/Corrosion' },
      ],
    },
    {
      title: 'Interior & Safety',
      items: [
        { name: 'Seat Belts' },
        { name: 'Horn Operation' },
        { name: 'Warning Lights (Dash)' },
        { name: 'AC/Heater Operation' },
        { name: 'Mirrors' },
      ],
    },
  ],
};

export default maintenance50Point;