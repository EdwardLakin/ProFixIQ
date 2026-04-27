"use client";

import { type ChangeEvent, useMemo, useState } from "react";

type UploadState = "pending" | "uploading" | "uploaded" | "failed";

type SelectedFile = {
  key: string;
  file: File;
  state: UploadState;
  message?: string;
};

export function OnboardingFileUploadPanel({
  sessionId,
  onUploaded,
}: {
  sessionId: string;
  onUploaded: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const hasPending = useMemo(
    () => selected.some((entry) => entry.state === "pending" || entry.state === "failed"),
    [selected],
  );

  const onSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setFeedback(null);
    setSelected((current) => [
      ...current,
      ...files.map((file, idx) => ({
        key: `${Date.now()}-${idx}-${file.name}`,
        file,
        state: "pending" as const,
      })),
    ]);

    event.target.value = "";
  };

  const uploadSelectedFiles = async () => {
    const targets = selected.filter((entry) => entry.state === "pending" || entry.state === "failed");
    if (!targets.length) {
      setFeedback("Choose at least one CSV file to upload.");
      return;
    }

    setBusy(true);
    setFeedback(null);

    setSelected((current) =>
      current.map((entry) =>
        targets.some((target) => target.key === entry.key)
          ? { ...entry, state: "uploading", message: undefined }
          : entry,
      ),
    );

    const form = new FormData();
    for (const target of targets) form.append("files", target.file);

    try {
      const res = await fetch(`/api/onboarding-agent/sessions/${sessionId}/upload-files`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();

      const byName = new Map<string, { status: string; error?: string }>();
      for (const result of json.files ?? []) {
        byName.set(String(result.originalFilename), {
          status: String(result.status),
          error: typeof result.error === "string" ? result.error : undefined,
        });
      }

      setSelected((current) =>
        current.map((entry) => {
          if (!targets.some((target) => target.key === entry.key)) return entry;
          const outcome = byName.get(entry.file.name);
          if (!outcome) return { ...entry, state: "failed", message: "Upload did not return a result." };
          if (outcome.status === "failed") return { ...entry, state: "failed", message: outcome.error || "Upload failed." };
          return { ...entry, state: "uploaded", message: "Staged and registered." };
        }),
      );

      if (!json.ok) {
        setFeedback("Some files could not be uploaded. Fix errors and try again.");
      } else {
        setFeedback("Files uploaded and staged successfully.");
      }

      await onUploaded();
    } catch {
      setSelected((current) =>
        current.map((entry) =>
          targets.some((target) => target.key === entry.key)
            ? { ...entry, state: "failed", message: "Upload request failed." }
            : entry,
        ),
      );
      setFeedback("Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
      <h2 className="text-sm font-semibold">Upload staged files</h2>
      <p className="mt-2 text-xs text-slate-300">
        Upload CSV exports from your old system. Files are staged for analysis only. No live ProFixIQ records are created during upload or analysis.
      </p>
      <p className="mt-1 text-xs text-cyan-200/80">CSV is supported in this phase. Spreadsheet support can be added next.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          multiple
          accept=".csv,text/csv"
          onChange={onSelectFiles}
          className="block text-sm text-slate-200 file:mr-4 file:rounded-md file:border file:border-cyan-400/40 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:text-cyan-100 hover:file:bg-cyan-500/10"
        />
        <button
          onClick={uploadSelectedFiles}
          disabled={!hasPending || busy}
          className="rounded-md border border-cyan-400/40 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload staged files"}
        </button>
      </div>

      {feedback ? <p className="mt-3 text-xs text-slate-300">{feedback}</p> : null}

      <div className="mt-3 space-y-2">
        {selected.map((entry) => (
          <div key={entry.key} className="rounded-lg border border-white/10 bg-slate-900/40 p-3 text-xs">
            <p className="text-slate-100">{entry.file.name}</p>
            <p className="text-slate-400">{Math.max(1, Math.round(entry.file.size / 1024))} KB</p>
            <p className="mt-1 capitalize text-cyan-200">{entry.state}</p>
            {entry.message ? <p className="mt-1 text-rose-200/90">{entry.message}</p> : null}
          </div>
        ))}
        {selected.length === 0 ? <p className="text-xs text-slate-400">No files selected yet.</p> : null}
      </div>
    </div>
  );
}
