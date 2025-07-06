type ParsedCommand =
  | {
      command: 'update_status';
      section: string;
      item: string;
      status: 'ok' | 'fail' | 'na';
    }
  | {
      command: 'update_value';
      section: string;
      item: string;
      value: string;
    }
  | {
      command: 'add_note';
      section: string;
      item: string;
      notes: string;
    }
  | {
      command: 'complete_item' | 'skip_item';
      section: string;
      item: string;
    }
  | {
      command: 'complete_inspection';
    };

export default async function interpretCommand(transcript: string): Promise<ParsedCommand[]> {
  try {
    const response = await fetch('/api/ai/interpret', {
      method: 'POST',
      body: JSON.stringify({ transcript }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let result = '';
    let done = false;

    while (!done && reader) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      result += decoder.decode(value, { stream: true });
    }

    // Ensure result is a single valid JSON array or object string
    const jsonStart = result.indexOf('{');
    const jsonEnd = result.lastIndexOf('}');
    const jsonString = result.substring(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(jsonString);

    // Support single or multiple commands
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('AI interpretation error:', error);
    return [];
  }
}