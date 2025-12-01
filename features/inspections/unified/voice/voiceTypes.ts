// features/inspections/unified/voice/voiceTypes.ts

export type VoiceCommandType =
  | "update_status"
  | "measurement"
  | "add_note"
  | "recommend"
  | "complete_item";

/**
 * Parsed voice command coming out of interpretTranscript().
 *
 * - `raw` is the original phrase as spoken.
 * - `sectionName` / `itemName` are fuzzy labels we’ll match against the
 *   inspection sections + items.
 */
export type VoiceCommand = {
  type: VoiceCommandType;
  raw: string;
  sectionName?: string;
  itemName?: string;
  value?: string | number;
  unit?: string;
  status?: string;
  note?: string;
};