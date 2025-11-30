export type VoiceCommandType =
  | "update_status"
  | "measurement"
  | "add_note"
  | "recommend"
  | "complete_item";

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
