// lib/inspection/commandProcessor.ts

type CommandType =
  | 'add'
  | 'recommend'
  | 'measurement'
  | 'na'
  | 'undo'
  | 'pause'
  | 'resume'
  | 'complete';

interface ParsedCommand {
  type: CommandType;
  section?: string;
  item?: string;
  notes?: string;
  measurement?: string;
}

const sectionSynonyms: Record<string, string> = {
  tire: 'tires',
  tires: 'tires',
  light: 'lights',
  lights: 'lights',
  brake: 'brakes',
  brakes: 'brakes',
  driveshaft: 'driveline',
  suspension: 'suspension',
  // add more synonyms here
};

function extractSection(input: string): string | undefined {
  for (const key of Object.keys(sectionSynonyms)) {
    if (input.toLowerCase().includes(key)) {
      return sectionSynonyms[key];
    }
  }
  return undefined;
}

export function parseInspectionCommand(input: string): ParsedCommand | null {
  const lower = input.toLowerCase();

  if (lower.includes('add')) {
    return {
      type: 'add',
      section: extractSection(lower),
      item: extractItem(lower),
      notes: input.replace(/.*add/i, '').trim(),
    };
  }

  if (lower.includes('recommend')) {
    return {
      type: 'recommend',
      section: extractSection(lower),
      item: extractItem(lower),
      notes: input.replace(/.*recommend/i, '').trim(),
    };
  }

  if (lower.includes('measurement')) {
    const measurement = extractMeasurement(lower);
    return {
      type: 'measurement',
      section: extractSection(lower),
      item: extractItem(lower),
      measurement,
    };
  }

  if (lower.includes('n/a') || lower.includes('not applicable')) {
    return {
      type: 'na',
      section: extractSection(lower),
    };
  }

  if (lower.includes('undo')) {
    return { type: 'undo' };
  }

  if (lower.includes('pause')) {
    return { type: 'pause' };
  }

  if (lower.includes('resume')) {
    return { type: 'resume' };
  }

  if (lower.includes('complete')) {
    return { type: 'complete' };
  }

  return null;
}

function extractItem(input: string): string {
  const match = input.match(/(?:add|recommend|measurement)\s(.+)/i);
  return match ? match[1].trim() : '';
}

function extractMeasurement(input: string): string | undefined {
  const match = input.match(/\d+(\.\d+)?\s?(mm|psi|inches|volts|amps)/);
  return match ? match[0] : undefined;
}