import type { TechnicianContext, TechnicianConversationTurn } from "../session/projectTechnicianContext";

export const TECHNICIAN_COPILOT_RECENT_TURN_LIMIT = 8;
const OLDER_CONVERSATION_SUMMARY_MAX_CHARS = 2400;
const SUMMARY_MESSAGE_MAX_CHARS = 320;

export type TechnicianReasoningContext = TechnicianContext & {
  conversationSummary: string | null;
};

function turnKey(turn: TechnicianConversationTurn, index: number): string {
  return turn.turnId ?? `${turn.eventId}:${index}`;
}

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function summarizeOlderConversation(
  conversation: readonly TechnicianConversationTurn[],
): string | null {
  if (conversation.length === 0) return null;

  const lines = conversation.map((turn) => {
    const speaker = turn.role === "user" ? "Technician" : "CoPilot";
    return `${speaker}: ${clip(turn.text, SUMMARY_MESSAGE_MAX_CHARS)}`;
  });

  const selected: string[] = [];
  let remaining = OLDER_CONVERSATION_SUMMARY_MAX_CHARS;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const separatorCost = selected.length > 0 ? 1 : 0;
    if (line.length + separatorCost > remaining) {
      if (selected.length === 0 && remaining > 1) {
        selected.push(clip(line, remaining));
      }
      break;
    }
    selected.push(line);
    remaining -= line.length + separatorCost;
  }

  selected.reverse();
  return selected.length > 0 ? selected.join("\n") : null;
}

export function boundTechnicianReasoningContext(
  context: TechnicianContext,
): TechnicianReasoningContext {
  const selectedTurnKeys = new Set<string>();

  for (
    let index = context.conversation.length - 1;
    index >= 0 && selectedTurnKeys.size < TECHNICIAN_COPILOT_RECENT_TURN_LIMIT;
    index -= 1
  ) {
    selectedTurnKeys.add(turnKey(context.conversation[index], index));
  }

  const recentConversation: TechnicianConversationTurn[] = [];
  const olderConversation: TechnicianConversationTurn[] = [];
  context.conversation.forEach((turn, index) => {
    if (selectedTurnKeys.has(turnKey(turn, index))) {
      recentConversation.push(turn);
    } else {
      olderConversation.push(turn);
    }
  });

  return {
    ...context,
    conversation: recentConversation,
    conversationSummary: summarizeOlderConversation(olderConversation),
  };
}

export function boundTechnicianCopilotModelInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const value = input as Record<string, unknown>;
  const repairContext = value.repairContext;
  if (!repairContext || typeof repairContext !== "object" || Array.isArray(repairContext)) {
    return input;
  }

  return {
    ...value,
    repairContext: boundTechnicianReasoningContext(
      repairContext as TechnicianContext,
    ),
  };
}
