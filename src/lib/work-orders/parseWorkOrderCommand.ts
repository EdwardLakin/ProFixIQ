export type Command = {
  action: 'set' | 'complete' | 'hold' | 'clear';
  field?: string;
  value?: string;
};

export function parseWorkOrderCommand(transcript: string): Command | null {
  const lower = transcript.toLowerCase().trim();

  // Match: "set complaint to engine knocking"
  const setMatch = lower.match(/set (\w+) to (.+)/);
  if (setMatch) {
    return {
      action: 'set',
      field: setMatch[1],
      value: setMatch[2],
    };
  }

  // Match: "complete job" or "mark complete"
  if (lower.includes('complete job') || lower.includes('mark complete')) {
    return { action: 'complete' };
  }

  // Match: "hold for parts", "hold for authorization"
  const holdMatch = lower.match(/hold(?: for)? (\w+)/);
  if (holdMatch) {
    return {
      action: 'hold',
      field: 'hold_reason',
      value: holdMatch[1],
    };
  }

  // Match: "clear correction", "clear cause"
  const clearMatch = lower.match(/clear (\w+)/);
  if (clearMatch) {
    return {
      action: 'clear',
      field: clearMatch[1],
    };
  }

  return null; // No valid command parsed
}