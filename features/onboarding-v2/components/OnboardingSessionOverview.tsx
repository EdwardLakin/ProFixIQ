export function OnboardingSessionOverview({ sessionId, status }: { sessionId: string; status: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-200">
      <div className="font-semibold">Session {sessionId}</div>
      <div className="mt-1 text-xs text-slate-400">Status: {status}</div>
      <div className="mt-4 grid gap-2 text-xs text-slate-300">
        <div>• Progress timeline placeholder</div>
        <div>• Upload/analyze/preview placeholders</div>
        <div>• Review/summary placeholders</div>
      </div>
    </div>
  );
}
