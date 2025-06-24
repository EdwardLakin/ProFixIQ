export const synonymMap: Record<string, { section: string; item: string }> = {
  // Engine Bay
  'engine oil': { section: 'Engine Bay', item: 'Engine Oil' },
  'oil filter': { section: 'Engine Bay', item: 'Oil Filter' },
  'air filter': { section: 'Engine Bay', item: 'Air Filter' },
  'cabin filter': { section: 'Engine Bay', item: 'Cabin Air Filter' },
  'coolant': { section: 'Engine Bay', item: 'Coolant Level' },
  'brake fluid': { section: 'Engine Bay', item: 'Brake Fluid Level' },
  'transmission fluid': { section: 'Engine Bay', item: 'Transmission Fluid Level' },
  'battery terminals': { section: 'Engine Bay', item: 'Battery Terminals' },
  'belts': { section: 'Engine Bay', item: 'Belts' },
  'hoses': { section: 'Engine Bay', item: 'Hoses' },

  // Brakes
  'front brakes': { section: 'Brakes', item: 'Front Brake Pads' },
  'rear brakes': { section: 'Brakes', item: 'Rear Brake Pads' },
  'rotors': { section: 'Brakes', item: 'Brake Rotors' },
  'brake lines': { section: 'Brakes', item: 'Brake Lines' },
  'brake fluid condition': { section: 'Brakes', item: 'Brake Fluid Condition' },

  // Tires
  'tread depth': { section: 'Tires', item: 'Tire Tread Depth' },
  'tire pressure': { section: 'Tires', item: 'Tire Pressure' },
  'spare tire': { section: 'Tires', item: 'Spare Tire' },
  'wheels': { section: 'Tires', item: 'Wheel Condition' },
  'valve stems': { section: 'Tires', item: 'Valve Stems' },

  // Lights
  'headlights': { section: 'Lights & Signals', item: 'Headlights' },
  'brake lights': { section: 'Lights & Signals', item: 'Brake Lights' },
  'reverse lights': { section: 'Lights & Signals', item: 'Reverse Lights' },
  'turn signals': { section: 'Lights & Signals', item: 'Turn Signals' },
  'plate light': { section: 'Lights & Signals', item: 'License Plate Light' },

  // Interior
  'horn': { section: 'Interior', item: 'Horn' },
  'wipers': { section: 'Interior', item: 'Windshield Wipers' },
  'washer fluid': { section: 'Interior', item: 'Washer Fluid' },
  'heater': { section: 'Interior', item: 'Heater Operation' },
  'ac': { section: 'Interior', item: 'AC Operation' },
  'check engine': { section: 'Interior', item: 'Check Engine Light' },
  'warning lights': { section: 'Interior', item: 'Warning Lights' },

  // Undercarriage
  'suspension': { section: 'Undercarriage', item: 'Suspension Components' },
  'steering linkages': { section: 'Undercarriage', item: 'Steering Linkages' },
  'cv boots': { section: 'Undercarriage', item: 'CV Boots' },
  'exhaust': { section: 'Undercarriage', item: 'Exhaust System' },
  'driveline': { section: 'Undercarriage', item: 'Driveline' },
  'oil leaks': { section: 'Undercarriage', item: 'Oil Leaks' },
  'trans leaks': { section: 'Undercarriage', item: 'Transmission Leaks' },
  'diff leaks': { section: 'Undercarriage', item: 'Differential Leaks' },

  // Fluids (repeats for safety)
  'power steering fluid': { section: 'Fluids', item: 'Power Steering Fluid' },
  'Windshield washer fluid': { section: 'Fluids', item: 'Windshield Washer Fluid' },

  // Service Items
  'reset light': { section: 'Service Items', item: 'Reset Maintenance Light' },
  'top off fluids': { section: 'Service Items', item: 'Top Off Fluids' },
  'inspect recalls': { section: 'Service Items', item: 'Inspect for Recalls' },
  'oil change': { section: 'Service Items', item: 'Oil Change' },
  'filter change': { section: 'Service Items', item: 'Oil Filter Change' },
};

export function resolveSynonym(raw: string): { section: string; item: string } | null {
  const normalized = raw.toLowerCase().trim();
  return synonymMap[normalized] || null;
}