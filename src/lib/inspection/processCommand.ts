// src/lib/inspection/processCommand.ts

import type { InspectionDraft } from './types';

interface CommandContext {
  text: string;
  draft: InspectionDraft;
  recentActions: {
    section: string;
    item: string;
    status?: string;
    notes?: string;
    measurement?: string;
  }[];
  synonyms?: Record<string, string>;
}

export function processCommand({
  text,
  draft,
  recentActions,
  synonyms = {},
}: CommandContext): {
  updatedDraft: InspectionDraft;
  updatedActions: CommandContext['recentActions'];
} {
  const cleaned = text.toLowerCase().trim();
  const newActions = [...recentActions];
  const result = { ...draft };

  // Handle UNDO
  if (cleaned === 'undo') {
    const last = newActions.pop();
    if (last) {
      delete result[last.section]?.[last.item];
    }
    return { updatedDraft: result, updatedActions: newActions };
  }

  const commandKeywords = {
    add: 'added',
    recommend: 'recommended',
    measurement: 'measured',
  };

  const matchedCommand = Object.entries(commandKeywords).find(([cmd]) =>
    cleaned.startsWith(cmd)
  );

  if (!matchedCommand) {
    return { updatedDraft: result, updatedActions: newActions };
  }

  const [command, status] = matchedCommand;
  const content = cleaned.replace(command, '').trim();
  const entries = content.split(',').map((s) => s.trim());

  for (const entry of entries) {
    const [rawSection, rawItem] = entry.split(/[:\-]/).map((s) => s.trim());
    const section = synonyms[rawSection] || rawSection;
    const item = synonyms[rawItem] || rawItem;

    if (!result[section]) result[section] = {};
    if (!result[section][item]) result[section][item] = {};

    if (command === 'measurement') {
      result[section][item].measurement = status || '';
    } else {
      result[section][item].status = status || '';
    }

    newActions.push({ section, item, status });
  }

  return {
    updatedDraft: result,
    updatedActions: newActions,
  };
}