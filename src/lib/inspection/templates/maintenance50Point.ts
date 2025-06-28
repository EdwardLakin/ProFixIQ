// File: lib/inspection/templates/maintenance50Point.ts

import { InspectionTemplate } from '../types';

const maintenance50Point: InspectionTemplate = {
  templateName: 'Maintenance 50 Point Inspection',
  sections: [
    {
      section: 'Underhood',
      items: [
        { item: 'Engine Oil Level' },
        { item: 'Coolant Level' },
        { item: 'Brake Fluid' },
        { item: 'Power Steering Fluid' },
        { item: 'Transmission Fluid' },
        { item: 'Belts' },
        { item: 'Hoses' },
        { item: 'Battery Condition' },
        { item: 'Battery Terminals' },
      ],
    },
    {
      section: 'Interior / Controls',
      items: [
        { item: 'Horn' },
        { item: 'Windshield Wipers' },
        { item: 'Windshield Washer Operation' },
        { item: 'Climate Control Operation' },
        { item: 'Instrument Cluster' },
        { item: 'Warning Lights' },
        { item: 'Parking Brake' },
        { item: 'Seat Belts' },
      ],
    },
    {
      section: 'Exterior',
      items: [
        { item: 'Headlights' },
        { item: 'Brake Lights' },
        { item: 'Turn Signals' },
        { item: 'Hazard Lights' },
        { item: 'Windshield Condition' },
        { item: 'Wiper Blades' },
        { item: 'Mirrors' },
        { item: 'Doors and Locks' },
      ],
    },
    {
      section: 'Tires / Brakes',
      items: [
        { item: 'Tire Condition' },
        { item: 'Tire Pressure' },
        { item: 'Brake Pads (Front)' },
        { item: 'Brake Pads (Rear)' },
        { item: 'Brake Rotors (Front)' },
        { item: 'Brake Rotors (Rear)' },
        { item: 'Spare Tire' },
      ],
    },
    {
      section: 'Under Vehicle',
      items: [
        { item: 'Leaks' },
        { item: 'Suspension' },
        { item: 'Steering Components' },
        { item: 'Exhaust System' },
        { item: 'Drive Axles / CV Joints' },
        { item: 'Frame / Structure' },
      ],
    },
    {
      section: 'Final Checks',
      items: [
        { item: 'Road Test' },
        { item: 'Reset Maintenance Light' },
        { item: 'Inspection Sticker' },
        { item: 'Customer Items Returned' },
      ],
    },
  ],
};

export default maintenance50Point;