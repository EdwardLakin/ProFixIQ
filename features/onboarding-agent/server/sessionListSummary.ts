type SessionListInputRow = {
  id: string;
  summary?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export function buildOnboardingSessionListPayload(params: {
  sessions: SessionListInputRow[];
  fileCounts: Map<string, number>;
  rawRowsBySession: Map<string, number>;
}) {
  return params.sessions.map((session) => {
    const sessionId = String(session.id);
    const rowsParsedTotal = Number(params.rawRowsBySession.get(sessionId) ?? 0);
    const summarySource = (session.summary && typeof session.summary === "object") ? session.summary : {};
    const aiRowsSampled = Number(summarySource.aiRowsSampled ?? 0);
    const aiFilesSampled = Number(summarySource.aiFilesSampled ?? 0);

    const existingLiveRecordsCreated = Number(summarySource.liveRecordsCreated ?? 0);
    const activationProgress = summarySource.activationProgress ?? null;
    const onboardingActivation = summarySource.onboardingActivation ?? null;

    return {
      ...session,
      file_count: params.fileCounts.get(sessionId) ?? 0,
      summary: {
        ...summarySource,
        rowsParsed: rowsParsedTotal,
        rowsParsedTotal,
        aiRowsSampled,
        aiFilesSampled,
        liveRecordsCreated: Number.isFinite(existingLiveRecordsCreated) ? existingLiveRecordsCreated : 0,
        activationProgress,
        onboardingActivation,
      },
    };
  });
}
