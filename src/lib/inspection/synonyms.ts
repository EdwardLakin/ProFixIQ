export const synonymMap: Record<string, { section: string; item: string }> = {
  'brake pads': { section: 'Brakes', item: 'Brake Pads' },
  'front brakes': { section: 'Brakes', item: 'Front Brake Pads' },
  'rear brakes': { section: 'Brakes', item: 'Rear Brake Pads' },
  'oil': { section: 'Engine', item: 'Engine Oil' },
  'engine oil': { section: 'Engine', item: 'Engine Oil' },
  'air filter': { section: 'Engine', item: 'Air Filter' },
  'cabin filter': { section: 'HVAC', item: 'Cabin Air Filter' },
  'alignment': { section: 'Suspension', item: 'Wheel Alignment' },
  'battery': { section: 'Electrical', item: 'Battery' },
  'tire tread': { section: 'Tires', item: 'Tire Tread Depth' },
  'coolant': { section: 'Cooling', item: 'Coolant Level' },
};

export function resolveSynonym(rawInput: string): { section: string; item: string } | null {
  const normalized = rawInput.toLowerCase().trim();
  return synonymMap[normalized] || null;
}