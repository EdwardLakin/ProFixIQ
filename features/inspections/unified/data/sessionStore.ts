import type { InspectionSession } from "@inspections/lib/inspection/types";

/**
 * Simple in-memory session store.
 * Swap this to Supabase later without touching callers.
 */
let inMemoryStore: Record<string, InspectionSession> = {};

export function getSessionFromStore(id: string): InspectionSession | null {
  return inMemoryStore[id] ?? null;
}

export function saveSessionToStore(id: string, session: InspectionSession) {
  inMemoryStore[id] = { ...session, id: session.id ?? id };
}

export function deleteSessionFromStore(id: string) {
  delete inMemoryStore[id];
}
