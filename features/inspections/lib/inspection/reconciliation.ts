import type { InspectionSession } from "@inspections/lib/inspection/types";

function timestamp(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inspectionRevision(
  session: InspectionSession | null | undefined,
): number {
  const value = session?.syncRevision;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export function inspectionFingerprint(
  session: InspectionSession | null | undefined,
): string {
  if (!session) return "";
  return [
    session.id ?? "",
    inspectionRevision(session),
    session.lastUpdated ?? "",
  ].join(":");
}

export function hasMeaningfulInspectionProgress(
  session: InspectionSession,
): boolean {
  if (session.transcript?.trim()) return true;
  if ((session.quote?.length ?? 0) > 0) return true;

  return (session.sections ?? []).some((section) =>
    (section.items ?? []).some((item) => {
      const value = item as unknown as {
        status?: unknown;
        notes?: unknown;
        value?: unknown;
        photoUrls?: unknown;
      };
      const status = String(value.status ?? "").trim().toLowerCase();
      const hasStatus =
        status.length > 0 &&
        !["pending", "not_started", "not started"].includes(status);
      const hasNotes =
        typeof value.notes === "string" && value.notes.trim().length > 0;
      const hasValue =
        value.value !== null &&
        value.value !== undefined &&
        String(value.value).trim().length > 0;
      const hasPhotos =
        Array.isArray(value.photoUrls) && value.photoUrls.length > 0;
      return hasStatus || hasNotes || hasValue || hasPhotos;
    }),
  );
}

export function remoteInspectionShouldReplace(args: {
  remote: InspectionSession;
  local: InspectionSession | null;
  lastPersistedFingerprint: string;
}): boolean {
  const { remote, local, lastPersistedFingerprint } = args;
  if (!local) return true;

  const remoteRevision = inspectionRevision(remote);
  const localRevision = inspectionRevision(local);
  const localFingerprint = inspectionFingerprint(local);
  const localIsDirty = lastPersistedFingerprint
    ? Boolean(localFingerprint) &&
      localFingerprint !== lastPersistedFingerprint
    : hasMeaningfulInspectionProgress(local);

  // A normal refresh must not erase an edit made after the last server
  // acknowledgement. A revision conflict will preserve that device copy.
  if (localIsDirty) return false;
  if (remoteRevision > localRevision) return true;
  if (remoteRevision < localRevision) return false;
  return timestamp(remote.lastUpdated) >= timestamp(local.lastUpdated);
}

export function shouldForceCanonicalBootstrap(args: {
  remote: InspectionSession;
  local: InspectionSession | null;
  preferCanonicalServer: boolean;
  hasPendingLocalSave: boolean;
  hasRecoveredLocalDraft: boolean;
}): boolean {
  const {
    remote,
    local,
    preferCanonicalServer,
    hasPendingLocalSave,
    hasRecoveredLocalDraft,
  } = args;
  const serverIsAhead =
    inspectionRevision(remote) > inspectionRevision(local);
  const hasUnversionedRecovery =
    hasRecoveredLocalDraft &&
    inspectionRevision(local) === 0 &&
    Boolean(local) &&
    hasMeaningfulInspectionProgress(local as InspectionSession);

  // A freshly initialized template is never a source of truth. Only a real
  // recovered device draft (or an operation already queued for the server)
  // can block the first canonical hydration.
  return (
    preferCanonicalServer &&
    !hasPendingLocalSave &&
    !hasUnversionedRecovery &&
    (!hasRecoveredLocalDraft || serverIsAhead)
  );
}
