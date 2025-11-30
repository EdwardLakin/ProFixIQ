import type { VoiceCommand } from "./voiceTypes";
import type {
  InspectionSession,
  InspectionItemStatus,
} from "@inspections/lib/inspection/types";

type UpdateSessionFn = (patch: Partial<InspectionSession>) => void;

export function applyVoiceCommands(
  commands: VoiceCommand[],
  session: InspectionSession,
  updateSession: UpdateSessionFn,
) {
  // stub that does nothing yet – safe placeholder
  console.debug("applyVoiceCommands (stub)", commands.length);
}
