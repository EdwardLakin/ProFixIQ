export function OnboardingFilesPanel({ files }: { files: Array<Record<string, unknown>> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h3 className="text-sm font-semibold text-white">Staged files</h3>
      <div className="mt-3 space-y-2 text-sm">
        {files.length === 0 ? <p className="text-slate-400">No files registered yet.</p> : files.map((file) => (
          <div key={String(file.id)} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
            <p className="text-white">{String(file.original_filename ?? file.storage_path)}</p>
            <p className="text-xs text-slate-400">{String(file.detected_domain ?? "unknown")} • rows: {String(file.row_count ?? 0)} • {String(file.parse_status ?? "pending")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
