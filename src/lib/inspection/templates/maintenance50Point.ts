import { InspectionTemplate } from '@lib/inspection/types';

const maintenance50Point: InspectionTemplate = {
  templateId: 'maintenance_50',
  templateName: 'Maintenance 50 Point',
  sections: [
    {
      id: 'under_hood',
      section: 'Under Hood',
      title: 'Under Hood',
      items: [
        { item: 'Engine Oil', status: 'ok' },
        { item: 'Coolant Level', status: 'ok' },
        { item: 'Transmission Fluid', status: 'ok' },
        { item: 'Brake Fluid', status: 'ok' },
        { item: 'Power Steering Fluid', status: 'ok' },
        { item: 'Windshield Washer Fluid', status: 'ok' },
        { item: 'Belts Condition', status: 'ok' },
        { item: 'Hoses Condition', status: 'ok' },
      ],
    },
    {
      id: 'battery_electrical',
      section: 'Battery & Electrical',
      title: 'Battery & Electrical',
      items: [
        { item: 'Battery Terminal', status: 'ok' },
        { item: 'Headlights', status: 'ok' },
        { item: 'Tail Lights', status: 'ok' },
        { item: 'Interior Lights', status: 'ok' },
        { item: 'Horn Operation', status: 'ok' },
      ],
    },
    {
      id: 'under_vehicle',
      section: 'Under Vehicle',
      title: 'Under Vehicle',
      items: [
        { item: 'Oil Leaks', status: 'ok' },
        { item: 'Coolant Leaks', status: 'ok' },
        { item: 'Transmission Leaks', status: 'ok' },
        { item: 'Exhaust System', status: 'ok' },
        { item: 'Brake Lines', status: 'ok' },
        { item: 'Fuel Lines', status: 'ok' },
        { item: 'Suspension Components', status: 'ok' },
        { item: 'Steering Components', status: 'ok' },
      ],
    },
    {
      id: 'brakes_tires',
      section: 'Brakes & Tires',
      title: 'Brakes & Tires',
      items: [
        { item: 'Front Brake Pads', status: 'ok' },
        { item: 'Rear Brake Pads', status: 'ok' },
        { item: 'Front Rotors', status: 'ok' },
        { item: 'Rear Rotors', status: 'ok' },
        { item: 'Parking Brake Operation', status: 'ok' },
        { item: 'Tire Tread Depth (Front)', status: 'ok' },
        { item: 'Tire Tread Depth (Rear)', status: 'ok' },
        { item: 'Tire Pressure (ALL)', status: 'ok' },
      ],
    },
    {
      id: 'interior',
      section: 'Interior',
      title: 'Interior',
      items: [
        { item: 'Seat Belts', status: 'ok' },
        { item: 'Wipers/Washers', status: 'ok' },
        { item: 'Defrost Operation', status: 'ok' },
        { item: 'AC Operation', status: 'ok' },
        { item: 'Warning Lights', status: 'ok' },
      ],
    },
    {
      id: 'final_checks',
      section: 'Final Checks',
      title: 'Final Checks',
      items: [
        { item: 'Road Test Drive Completed', status: 'ok' },
        { item: 'No Issues Observed', status: 'ok' },
        { item: 'Reset Maintenance Light', status: 'ok' },
        { item: 'Work Completed Sticker Applied', status: 'ok' },
      ],
    },
  ],
};

export default maintenance50Point;