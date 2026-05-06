export function AgentReadinessBanner({ ready, detail }: { ready: boolean; detail: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-200">
      <div className="font-semibold">Agent readiness: {ready ? "Ready" : "Not ready"}</div>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}
