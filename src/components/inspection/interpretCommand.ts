// src/components/inspection/interpretCommand.ts

import { ParsedCommand } from '@lib/inspection/types';

export default async function interpretCommand(transcript: string): Promise<ParsedCommand[]> {
  try {
    const response = await fetch('/api/ai/interpret', {
      method: 'POST',
      body: JSON.stringify({ transcript }),
    });

    if (!response.ok) {
      console.error('Interpret API failed:', response.statusText);
      return [];
    }

    const resultText = await response.text();

    // Extract and clean JSON object from response
    const jsonStart = resultText.indexOf('{');
    const jsonEnd = resultText.lastIndexOf('}');
    const jsonString = resultText.substring(jsonStart, jsonEnd + 1);

    const parsed = JSON.parse(jsonString);

    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('AI interpretation error:', error);
    return [];
  }
}