import type {
  InspectionItemStatus,
  ParsedCommand,
  VoiceCommandApplyResult,
} from "@inspections/lib/inspection/types";

type PartsDraft = Array<{ description: string; qty: number }>;

export type VoiceBrainFollowUpDecision =
  | { kind: "none" }
  | { kind: "photo_prompt"; prompt: string };

export type VoiceBrainFeedback = {
  spoken: string;
  toast: string;
  followUp: VoiceBrainFollowUpDecision;
};

function norm(input: string | null | undefined): string {
  return String(input ?? "").trim().toLowerCase();
}

function titleCase(input: string | null | undefined): string {
  const s = String(input ?? "").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getCommandType(command: ParsedCommand): string {
  const rec = command as Record<string, unknown>;
  if (typeof rec.command === "string") return rec.command;
  if (typeof rec.type === "string") return rec.type;
  return "command";
}

function getCommandStatus(command: ParsedCommand): InspectionItemStatus | null {
  const rec = command as Record<string, unknown>;
  const raw = norm(typeof rec.status === "string" ? rec.status : null);

  if (raw === "ok" || raw === "fail" || raw === "na" || raw === "recommend") {
    return raw;
  }
  if (raw === "pass" || raw === "okay") return "ok";
  if (raw === "rec") return "recommend";
  return null;
}

function getCommandItem(command: ParsedCommand): string {
  const rec = command as Record<string, unknown>;
  return typeof rec.item === "string" ? rec.item.trim() : "";
}

function getCommandParts(command: ParsedCommand): PartsDraft {
  const rec = command as Record<string, unknown>;
  if (!Array.isArray(rec.parts)) return [];

  return rec.parts
    .map((row) => {
      const part = row as { description?: unknown; qty?: unknown };
      const description = String(part.description ?? "").trim();
      const qty = Number(part.qty ?? 1);
      return {
        description,
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      };
    })
    .filter((p) => p.description.length > 0);
}

function getCommandLaborHours(command: ParsedCommand): number | null {
  const rec = command as Record<string, unknown>;
  return typeof rec.laborHours === "number" && Number.isFinite(rec.laborHours)
    ? rec.laborHours
    : null;
}

function firstSuccessful(
  applied: VoiceCommandApplyResult[],
): VoiceCommandApplyResult | null {
  for (const row of applied) {
    if (row.ok) return row;
  }
  return null;
}

function buildPartsLaborSummary(
  parts: PartsDraft,
  laborHours: number | null,
): string {
  const pieces: string[] = [];

  if (laborHours != null) {
    pieces.push(`${laborHours} hour${laborHours === 1 ? "" : "s"} labor`);
  }

  if (parts.length > 0) {
    pieces.push(parts.map((p) => `${p.qty} ${p.description}`).join(", "));
  }

  return pieces.join(" and ");
}

export function buildVoiceBrainFeedback(args: {
  rawSpeech: string;
  parsed: ParsedCommand[];
  applied: VoiceCommandApplyResult[];
}): VoiceBrainFeedback {
  const { parsed, applied } = args;

  const firstOk = firstSuccessful(applied);
  if (!firstOk || parsed.length === 0) {
    return {
      spoken: "I didn’t catch a usable inspection update.",
      toast: "No inspection update applied.",
      followUp: { kind: "none" },
    };
  }

  const primary = parsed[0];
  const type = getCommandType(primary);
  const status = getCommandStatus(primary);
  const item = titleCase(getCommandItem(primary)) || "Item";
  const parts = getCommandParts(primary);
  const laborHours = getCommandLaborHours(primary);

  if ((type === "status" || type === "update_status") && status === "ok") {
    return {
      spoken: `${item} marked okay.`,
      toast: `${item} marked OK`,
      followUp: { kind: "none" },
    };
  }

  if ((type === "status" || type === "update_status") && status === "na") {
    return {
      spoken: `${item} marked not applicable.`,
      toast: `${item} marked NA`,
      followUp: { kind: "none" },
    };
  }

  if ((type === "status" || type === "update_status") && status === "fail") {
    const summary = buildPartsLaborSummary(parts, laborHours);

    return {
      spoken: summary
        ? `${item} failed. ${summary} added. Would you like to add a photo?`
        : `${item} failed. Would you like to add a photo?`,
      toast: summary ? `${item} failed • ${summary}` : `${item} failed`,
      followUp: {
        kind: "photo_prompt",
        prompt: "Would you like to add a photo?",
      },
    };
  }

  if ((type === "status" || type === "update_status") && status === "recommend") {
    const summary = buildPartsLaborSummary(parts, laborHours);

    return {
      spoken: summary
        ? `${item} recommended. ${summary} added. Would you like to add a photo?`
        : `${item} recommended. Would you like to add a photo?`,
      toast: summary ? `${item} recommended • ${summary}` : `${item} recommended`,
      followUp: {
        kind: "photo_prompt",
        prompt: "Would you like to add a photo?",
      },
    };
  }

  if (type === "measurement" || type === "update_value") {
    return {
      spoken: `${item} updated.`,
      toast: `${item} value updated`,
      followUp: { kind: "none" },
    };
  }

  return {
    spoken: "Inspection updated.",
    toast: "Inspection updated",
    followUp: { kind: "none" },
  };
}
