import { parseCommand } from "./parseCommand";

export interface InspectionItem {
  id: string;
  label: string;
  section: string;
  status: "good" | "fail" | "na";
  notes?: string;
  measurement?: string;
}

export interface InspectionDraft {
  items: InspectionItem[];
  history: string[];
  paused: boolean;
  completed: boolean;
}

export function handleInspectionCommand(input: string, draft: InspectionDraft): InspectionDraft {
  const command = parseCommand(input);
  const updated = { ...draft, history: [...draft.history, input] };

  switch (command.type) {
    case "pause":
      return { ...updated, paused: true };

    case "resume":
      return { ...updated, paused: false };

    case "complete":
      return { ...updated, completed: true };

    case "undo":
      if (draft.history.length === 0) return draft;
      return {
        ...updated,
        items: draft.items.slice(0, -1),
        history: draft.history.slice(0, -1),
      };

    case "na":
      return {
        ...updated,
        items: updated.items.map((item) =>
          item.section.toLowerCase() === command.section.toLowerCase()
            ? { ...item, status: "na" }
            : item
        ),
      };

    case "add":
      return {
        ...updated,
        items: [...updated.items, { id: genId(), label: command.text, section: "unknown", status: "fail", notes: command.text }],
      };

    case "measurement":
      return {
        ...updated,
        items: [...updated.items, { id: genId(), label: command.text, section: "unknown", status: "good", measurement: command.text }],
      };

    case "recommend":
      return {
        ...updated,
        items: [...updated.items, { id: genId(), label: command.text, section: "unknown", status: "good", notes: `Recommended: ${command.text}` }],
      };

    case "unknown":
      return updated;
  }
}

function genId() {
  return Math.random().toString(36).substring(2, 9);
}