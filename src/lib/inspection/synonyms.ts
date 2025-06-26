export const statusSynonyms: Record<string, string[]> = {
  ok: ['ok', 'good', 'working', 'fine', 'passed', 'pass'],
  fail: ['fail', 'failed', 'bad', 'broken', 'leaking', 'worn', 'cracked'],
  na: ['n/a', 'not applicable', 'skip', 'na'],
};

export const itemSynonyms: Record<string, string[]> = {
  'Engine Oil': ['engine oil', 'oil level'],
  'Coolant': ['coolant', 'antifreeze'],
  'Brake Fluid': ['brake fluid'],
  'Transmission Fluid': ['transmission fluid'],
  'Power Steering Fluid': ['power steering'],
  'Windshield Washer Fluid': ['washer fluid', 'wiper fluid'],

  'Front Brake Pads': ['front brake pads', 'front brakes'],
  'Rear Brake Pads': ['rear brake pads', 'rear brakes'],
  'Rotors': ['rotors', 'brake rotors'],
  'Brake Lines': ['brake lines'],
  'Brake Calipers': ['brake calipers', 'calipers'],

  'Battery Terminals': ['battery terminals'],
  'Battery Voltage': ['battery voltage'],
  'Alternator Belt': ['alternator belt'],
  'Starter Function': ['starter', 'starter function'],

  'Tire Tread Depth': ['tire tread', 'tread depth'],
  'Tire Pressure': ['tire pressure'],
  'Suspension Bushings': ['suspension bushings'],
  'Shocks/Struts': ['shocks', 'struts'],
  'Wheel Bearings': ['wheel bearings'],
  'Alignment (Visual)': ['alignment'],

  'Headlights': ['headlights', 'head lights'],
  'Brake Lights': ['brake lights'],
  'Turn Signals': ['turn signals'],
  'Interior Lights': ['interior lights'],
  'Horn': ['horn'],
  'Power Windows/Locks': ['power windows', 'power locks'],

  'Serpentine Belt': ['serpentine belt'],
  'Radiator Hoses': ['radiator hoses'],
  'Heater Hoses': ['heater hoses'],
  'Vacuum Lines': ['vacuum lines'],

  'Leaks (Oil/Coolant)': ['leaks', 'oil leak', 'coolant leak'],
  'Exhaust System': ['exhaust'],
  'Frame Rust': ['frame rust', 'rust'],
  'Body Damage': ['body damage'],
  'Wiper Blades': ['wiper blades'],

  'Heater Operation': ['heater'],
  'AC Operation': ['air conditioning', 'ac'],
  'Cabin Ventilation': ['ventilation', 'cabin air'],
};