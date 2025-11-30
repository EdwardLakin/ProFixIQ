import type { InspectionSession } from "@inspections/lib/inspection/types";

let inMemoryStore: Record<string, InspectionSession> = {};

export function getSessionFromStore(id: string): InspectionSession | null {
  return inMemoryStore[id] ?? null;
}

export function saveSessionToStore(id: string, session: InspectionSession) {
  inMemoryStore[id] = session;
}
