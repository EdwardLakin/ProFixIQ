"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type WorkforceDocument = {
  id: string;
  docType: string | null;
  status: string | null;
  uploadedAt: string | null;
  expiresAt: string | null;
  userId: string;
  personName: string | null;
  personEmail: string | null;
  viewPath: string;
};

type ResponsePayload = {
  summary: { total: number; recent: number; needsReview: number; expired: number; expiringSoon: number };
  documents: WorkforceDocument[];
  generatedAt: string;
};

export default function WorkforceDocumentsClient() {
  const [data, setData] = useState<ResponsePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/workforce/documents-readiness", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed loading documents readiness");
        setData(json);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const now = Date.now();
  const in30 = now + 1000 * 60 * 60 * 24 * 30;
  const recentCutoff = now - 1000 * 60 * 60 * 24 * 14;

  const sections = useMemo(() => {
    const docs = data?.documents ?? [];
    return {
      needsReview: docs.filter((doc) => ["received", "pending", "review", "needs_review"].includes(String(doc.status ?? "").toLowerCase())),
      expiringSoon: docs.filter((doc) => {
        const ts = doc.expiresAt ? new Date(doc.expiresAt).getTime() : null;
        return ts !== null && Number.isFinite(ts) && ts >= now && ts <= in30;
      }),
      expired: docs.filter((doc) => {
        const ts = doc.expiresAt ? new Date(doc.expiresAt).getTime() : null;
        return ts !== null && Number.isFinite(ts) && ts < now;
      }),
      recent: docs.filter((doc) => (doc.uploadedAt ? new Date(doc.uploadedAt).getTime() >= recentCutoff : false)),
      all: docs,
    };
  }, [data, in30, now, recentCutoff]);

  const openDoc = async (doc: WorkforceDocument) => {
    const res = await fetch(doc.viewPath, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || !json?.signedUrl) {
      alert(json?.error ?? "Unable to open document");
      return;
    }
    window.open(json.signedUrl, "_blank", "noopener,noreferrer");
  };

  const renderRows = (rows: WorkforceDocument[]) => (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <table className="min-w-full text-sm text-neutral-200">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-neutral-400">
          <tr><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Uploaded</th><th className="px-3 py-2 text-left">Expires</th><th className="px-3 py-2 text-right">Action</th></tr>
        </thead>
        <tbody>
          {rows.map((doc) => (
            <tr key={doc.id} className="border-t border-white/10">
              <td className="px-3 py-2 capitalize">{(doc.docType ?? "other").replaceAll("_", " ")}</td>
              <td className="px-3 py-2">{doc.status ?? "—"}</td>
              <td className="px-3 py-2">{doc.personName ?? "Unknown"}<div className="text-xs text-neutral-400">{doc.personEmail ?? doc.userId}</div></td>
              <td className="px-3 py-2">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}</td>
              <td className="px-3 py-2">{doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : "—"}</td>
              <td className="px-3 py-2 text-right"><button onClick={() => void openDoc(doc)} className="rounded border border-white/15 px-2 py-1 hover:bg-white/10">Open</button></td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-center text-neutral-400">No documents in this section.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );

  if (loading) return <div className="rounded-2xl border border-white/10 bg-black/25 p-5 text-neutral-300">Loading Documents Command…</div>;
  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5 text-red-200">{error}</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
        <h1 className="text-2xl font-semibold text-white">Documents Command</h1>
        <p className="mt-1 text-sm text-neutral-300">Workforce readiness for document collection and compliance.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs"><Link href="/dashboard/workforce/people" className="rounded border border-white/15 px-2 py-1 text-orange-300">Open People</Link><Link href="/dashboard/admin/employee-docs" className="rounded border border-white/15 px-2 py-1 text-neutral-300">Open Upload Console</Link></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-5">{Object.entries({Total: data?.summary.total ?? 0, Recent: data?.summary.recent ?? 0, "Needs Review": data?.summary.needsReview ?? 0, Expired: data?.summary.expired ?? 0, "Expiring Soon": data?.summary.expiringSoon ?? 0}).map(([k, v]) => <div key={k} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs text-neutral-400">{k}</div><div className="text-xl font-semibold text-white">{v}</div></div>)}</div>
      <div className="space-y-4">
        <section><h2 className="mb-2 text-sm font-semibold text-orange-300">Needs Review</h2>{renderRows(sections.needsReview)}</section>
        <section><h2 className="mb-2 text-sm font-semibold text-yellow-300">Expiring Soon</h2>{renderRows(sections.expiringSoon)}</section>
        <section><h2 className="mb-2 text-sm font-semibold text-red-300">Expired</h2>{renderRows(sections.expired)}</section>
        <section><h2 className="mb-2 text-sm font-semibold text-cyan-300">Recent Uploads</h2>{renderRows(sections.recent)}</section>
        <section><h2 className="mb-2 text-sm font-semibold text-neutral-200">All Documents</h2>{renderRows(sections.all)}</section>
      </div>
    </div>
  );
}
