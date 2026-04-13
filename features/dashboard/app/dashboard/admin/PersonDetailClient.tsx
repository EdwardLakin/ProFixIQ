"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import {
  AdminBadge,
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
  AdminPageShell,
  AdminPanel,
  AdminPanelTitle,
  AdminStatCard,
  AdminStatGrid,
  AdminToolbar,
} from "@/features/dashboard/app/dashboard/admin/AdminSurface";

type Certification = {
  id: string;
  cert_type: string;
  cert_name: string;
  cert_number: string | null;
  issuing_body: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: "active" | "expired" | "revoked" | "pending";
  notes: string | null;
};

type PersonDetail = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  completed_onboarding: boolean;
  last_active_at: string | null;
  created_at: string | null;
  workforce_profile: {
    workforce_role: string | null;
    workforce_category: string | null;
    employment_status: "active" | "inactive" | "on_leave";
    start_date: string | null;
    payroll_ready: boolean;
    notes: string | null;
  };
  payroll_posture: {
    is_payroll_ready: boolean;
    open_period_entries: number;
    blocking_exceptions: number;
    warning_exceptions: number;
    in_current_period: boolean;
    missing_workforce_data: string[];
  };
  audit_preview: Array<{ id: string; action: string | null; created_at: string | null; target: string | null; actor_id: string | null; metadata: unknown }>;
  certifications: Certification[];
};

type CertificationDraft = Omit<Certification, "id">;

const EMPTY_CERT: CertificationDraft = {
  cert_name: "",
  cert_type: "certification",
  cert_number: "",
  issuing_body: "",
  issue_date: null,
  expiry_date: null,
  status: "active",
  notes: "",
};

function certPosture(cert: Certification) {
  if (cert.status === "revoked") return "Revoked";
  if (cert.status === "pending") return "Pending";
  const now = Date.now();
  const in30 = now + 1000 * 60 * 60 * 24 * 30;
  const in60 = now + 1000 * 60 * 60 * 24 * 60;
  const expiry = cert.expiry_date ? new Date(cert.expiry_date).getTime() : null;
  if (expiry && expiry < now) return "Expired";
  if (expiry && expiry <= in30) return "Expiring ≤30 days";
  if (expiry && expiry <= in60) return "Expiring 31-60 days";
  return cert.status === "expired" ? "Expired" : "Active";
}

export default function PersonDetailClient({ personId }: { personId: string }) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [certSaving, setCertSaving] = useState(false);
  const [newCert, setNewCert] = useState<CertificationDraft>(EMPTY_CERT);
  const [editingCertId, setEditingCertId] = useState<string | null>(null);
  const [editingCert, setEditingCert] = useState<CertificationDraft>(EMPTY_CERT);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/people/${personId}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to load person detail");
        return;
      }
      setDetail(body as PersonDetail);
    })();
  }, [personId]);

  const missingChecklist = useMemo(() => {
    if (!detail) return [];
    const items: string[] = [];
    if (!detail.phone) items.push("Phone number");
    if (!detail.role) items.push("Identity role assignment");
    if (!detail.completed_onboarding) items.push("Onboarding completion");
    if (!detail.workforce_profile.start_date) items.push("Employment start date");
    if (!detail.workforce_profile.payroll_ready) items.push("Payroll readiness");
    return items;
  }, [detail]);

  const certSummary = useMemo(() => {
    const base = { expired: 0, expiring30: 0, expiring60: 0, active: 0, pending: 0, revoked: 0 };
    if (!detail) return base;
    for (const cert of detail.certifications) {
      const posture = certPosture(cert);
      if (posture === "Expired") base.expired += 1;
      else if (posture === "Expiring ≤30 days") base.expiring30 += 1;
      else if (posture === "Expiring 31-60 days") base.expiring60 += 1;
      else if (posture === "Pending") base.pending += 1;
      else if (posture === "Revoked") base.revoked += 1;
      else base.active += 1;
    }
    return base;
  }, [detail]);

  async function saveIdentityAndWorkforce() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/people/${personId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        full_name: detail.full_name,
        phone: detail.phone,
        role: detail.role,
        completed_onboarding: detail.completed_onboarding,
        workforce_profile: detail.workforce_profile,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Save failed");
    }
  }

  async function addCertification() {
    if (!newCert.cert_name.trim()) return;
    setCertSaving(true);
    const res = await fetch(`/api/admin/people/${personId}/certifications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newCert),
    });
    const body = await res.json().catch(() => null);
    setCertSaving(false);
    if (!res.ok) {
      setError(body?.error ?? "Failed to add certification");
      return;
    }
    setDetail((prev) => (prev ? { ...prev, certifications: [body.certification as Certification, ...prev.certifications] } : prev));
    setNewCert(EMPTY_CERT);
  }

  async function saveEditedCertification() {
    if (!editingCertId || !editingCert.cert_name.trim()) return;
    setCertSaving(true);
    const res = await fetch(`/api/admin/people/${personId}/certifications/${editingCertId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editingCert),
    });
    const body = await res.json().catch(() => null);
    setCertSaving(false);
    if (!res.ok) {
      setError(body?.error ?? "Failed to update certification");
      return;
    }
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            certifications: prev.certifications.map((item) => (item.id === editingCertId ? (body.certification as Certification) : item)),
          }
        : prev,
    );
    setEditingCertId(null);
    setEditingCert(EMPTY_CERT);
  }

  async function deleteCertification(certId: string) {
    if (!confirm("Delete this certification?")) return;
    const res = await fetch(`/api/admin/people/${personId}/certifications/${certId}`, { method: "DELETE" });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to delete certification");
      return;
    }
    setDetail((prev) => (prev ? { ...prev, certifications: prev.certifications.filter((item) => item.id !== certId) } : prev));
  }

  if (!detail) {
    return (
      <AdminPageShell>
        <AdminEmptyState title="Loading person workspace" body="Pulling identity, workforce, certifications, payroll posture, and audit context." />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="People Record Workspace"
        title={detail.full_name ?? "Person record"}
        subtitle="Manage identity/access, workforce profile, certifications/licensing, payroll posture, and activity from one canonical staff record."
      />

      <AdminPanel>
        <AdminPanelTitle title="Overview" description="Use this to see readiness posture before editing deeper sections." />
        <AdminStatGrid>
          <AdminStatCard label="Role" value={detail.role ?? "Unassigned"} />
          <AdminStatCard label="Employment" value={detail.workforce_profile.employment_status} />
          <AdminStatCard label="Payroll blocking" value={detail.payroll_posture.blocking_exceptions} />
          <AdminStatCard label="Expiring certs (30d)" value={certSummary.expiring30} />
          <AdminStatCard label="Expired certs" value={certSummary.expired} />
        </AdminStatGrid>
        <div className="p-4 text-xs text-neutral-300">
          <p className="mb-2 font-medium text-neutral-100">Top missing items</p>
          {missingChecklist.length === 0 ? <p>Record is operationally complete.</p> : missingChecklist.map((item) => <p key={item}>• {item}</p>)}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Identity & Access" description="Account governance belongs here: identity fields, role, and account posture." />
        <AdminToolbar>
          <AdminField label="Full name" className="flex-1">
            <input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={detail.full_name ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, full_name: e.target.value } : prev)} />
          </AdminField>
          <AdminField label="Email (source of truth)" className="flex-1">
            <input className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-400" value={detail.email ?? ""} disabled />
          </AdminField>
          <AdminField label="Phone" className="flex-1">
            <input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={detail.phone ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, phone: e.target.value } : prev)} />
          </AdminField>
          <AdminField label="Role" className="w-full md:w-64">
            <input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={detail.role ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, role: e.target.value } : prev)} />
          </AdminField>
        </AdminToolbar>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Workforce Profile" description="Employment posture, workforce category, and payroll readiness belong to workforce management." />
        <AdminToolbar>
          <AdminField label="Workforce role" className="flex-1">
            <input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={detail.workforce_profile.workforce_role ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, workforce_role: e.target.value } } : prev)} />
          </AdminField>
          <AdminField label="Category" className="flex-1">
            <input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={detail.workforce_profile.workforce_category ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, workforce_category: e.target.value } } : prev)} />
          </AdminField>
          <AdminField label="Employment status" className="w-full md:w-52">
            <select className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={detail.workforce_profile.employment_status} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, employment_status: e.target.value as "active" | "inactive" | "on_leave" } } : prev)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
          </AdminField>
          <AdminField label="Start date" className="w-full md:w-52">
            <input type="date" className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={detail.workforce_profile.start_date ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, start_date: e.target.value || null } } : prev)} />
          </AdminField>
        </AdminToolbar>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-xs text-neutral-300">
            <input type="checkbox" checked={detail.workforce_profile.payroll_ready} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, payroll_ready: e.target.checked } } : prev)} />
            Payroll/time-ready for active period processing
          </label>
          <textarea
            className="min-h-24 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-neutral-200"
            placeholder="Employment status context / workforce notes"
            value={detail.workforce_profile.notes ?? ""}
            onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, notes: e.target.value } } : prev)}
          />
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Certifications & Licensing" description="Track workforce credentials, edit records in place, and act on expiry risk." />
        <AdminToolbar>
          <AdminField label="Name" className="flex-1"><input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.cert_name} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_name: e.target.value }))} /></AdminField>
          <AdminField label="Type" className="w-full md:w-40"><input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.cert_type} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_type: e.target.value }))} /></AdminField>
          <AdminField label="Number" className="w-full md:w-40"><input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.cert_number ?? ""} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_number: e.target.value }))} /></AdminField>
          <AdminField label="Expiry" className="w-full md:w-44"><input type="date" className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.expiry_date ?? ""} onChange={(e) => setNewCert((prev) => ({ ...prev, expiry_date: e.target.value || null }))} /></AdminField>
          <AdminField label="Status" className="w-full md:w-40"><select className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.status} onChange={(e) => setNewCert((prev) => ({ ...prev, status: e.target.value as Certification["status"] }))}><option value="active">active</option><option value="pending">pending</option><option value="expired">expired</option><option value="revoked">revoked</option></select></AdminField>
          <Button type="button" variant="default" className="mt-5" onClick={() => void addCertification()} disabled={certSaving}>{certSaving ? "Saving…" : "Add credential"}</Button>
        </AdminToolbar>

        <div className="flex flex-wrap gap-2 px-4 pb-3 text-xs">
          <AdminBadge>{certSummary.expired} expired</AdminBadge>
          <AdminBadge>{certSummary.expiring30} expiring ≤30d</AdminBadge>
          <AdminBadge>{certSummary.expiring60} expiring 31-60d</AdminBadge>
          <AdminBadge>{certSummary.active} active</AdminBadge>
        </div>

        {detail.certifications.length === 0 ? (
          <AdminEmptyState title="No credentials yet" body="Add certifications/licenses so readiness and expiry posture are visible." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400"><tr><th className="px-4 py-2.5 text-left">Credential</th><th className="px-4 py-2.5 text-left">Issuer</th><th className="px-4 py-2.5 text-left">Dates</th><th className="px-4 py-2.5 text-left">Posture</th><th className="px-4 py-2.5 text-left">Actions</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {detail.certifications.map((cert) => (
                  <tr key={cert.id} className="text-neutral-200">
                    <td className="px-4 py-2.5"><p className="font-medium text-neutral-100">{cert.cert_name}</p><p className="text-xs text-neutral-500">{cert.cert_type} {cert.cert_number ? `• ${cert.cert_number}` : ""}</p></td>
                    <td className="px-4 py-2.5 text-xs">{cert.issuing_body ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">Issued: {cert.issue_date ?? "—"}<br />Expires: {cert.expiry_date ?? "—"}</td>
                    <td className="px-4 py-2.5"><AdminBadge>{certPosture(cert)}</AdminBadge></td>
                    <td className="px-4 py-2.5 text-xs">
                      <button
                        className="mr-3 text-orange-300 hover:text-orange-200"
                        onClick={() => {
                          setEditingCertId(cert.id);
                          setEditingCert({
                            cert_type: cert.cert_type,
                            cert_name: cert.cert_name,
                            cert_number: cert.cert_number,
                            issuing_body: cert.issuing_body,
                            issue_date: cert.issue_date,
                            expiry_date: cert.expiry_date,
                            status: cert.status,
                            notes: cert.notes,
                          });
                        }}
                      >Edit</button>
                      <button className="text-red-300 hover:text-red-200" onClick={() => void deleteCertification(cert.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingCertId ? (
          <div className="m-4 rounded-xl border border-white/15 bg-black/35 p-4">
            <p className="mb-2 text-sm font-medium text-white">Edit credential</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs" placeholder="Name" value={editingCert.cert_name} onChange={(e) => setEditingCert((prev) => ({ ...prev, cert_name: e.target.value }))} />
              <input className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs" placeholder="Type" value={editingCert.cert_type} onChange={(e) => setEditingCert((prev) => ({ ...prev, cert_type: e.target.value }))} />
              <select className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs" value={editingCert.status} onChange={(e) => setEditingCert((prev) => ({ ...prev, status: e.target.value as Certification["status"] }))}><option value="active">active</option><option value="pending">pending</option><option value="expired">expired</option><option value="revoked">revoked</option></select>
              <input className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs" placeholder="Number" value={editingCert.cert_number ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, cert_number: e.target.value }))} />
              <input className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs" placeholder="Issuing body" value={editingCert.issuing_body ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, issuing_body: e.target.value }))} />
              <input type="date" className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs" value={editingCert.expiry_date ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, expiry_date: e.target.value || null }))} />
            </div>
            <textarea className="mt-3 min-h-20 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs" placeholder="Notes" value={editingCert.notes ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, notes: e.target.value }))} />
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="default" onClick={() => void saveEditedCertification()} disabled={certSaving}>{certSaving ? "Saving…" : "Save certification"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditingCertId(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Payroll Time Posture" description="Review payroll-readiness context before jumping into period approval/export." />
        <div className="grid gap-3 p-4 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/25 p-3">
            <p className="font-medium text-neutral-100">Readiness posture</p>
            <p className="mt-1">{detail.payroll_posture.is_payroll_ready ? "Marked payroll-ready" : "Not payroll-ready"}</p>
            <p>{detail.payroll_posture.blocking_exceptions} blocking • {detail.payroll_posture.warning_exceptions} warning</p>
            <p>{detail.payroll_posture.in_current_period ? "Included in current open period" : "No open-period entries yet"}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/25 p-3">
            <p className="font-medium text-neutral-100">Missing data for review</p>
            {detail.payroll_posture.missing_workforce_data.length === 0 ? (
              <p>None.</p>
            ) : (
              detail.payroll_posture.missing_workforce_data.map((item) => <p key={item}>• {item}</p>)
            )}
            <Link href={`/dashboard/admin/payroll-time?person_id=${detail.id}`} className="mt-2 inline-block rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-medium text-orange-300 hover:text-orange-200">Open Payroll Time →</Link>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Activity / Audit" description="Recent governance events linked to this person record." action={<Link href="/dashboard/admin/audit" className="text-xs font-medium text-orange-300 hover:text-orange-200">Open full audit →</Link>} />
        {detail.audit_preview.length === 0 ? (
          <AdminEmptyState title="No recent activity" body="No audit trail rows matched this person in the latest window." />
        ) : (
          <div className="space-y-2 p-4 text-sm text-neutral-300">
            {detail.audit_preview.map((row) => (
              <div key={row.id} className="rounded-lg border border-white/10 bg-black/25 p-3">
                <p className="font-medium text-neutral-100">{row.action ?? "event"}</p>
                <p className="text-xs text-neutral-400">{row.created_at ? new Date(row.created_at).toLocaleString() : "Unknown time"} • target: {row.target ?? "—"} • actor: {row.actor_id ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Documents" description="Document workflows will be added once upload/index foundation lands in People." />
        <div className="p-4 text-xs text-neutral-400">Documents are intentionally deferred in this pass to avoid placeholder-only records without retrieval and governance controls.</div>
      </AdminPanel>

      <AdminToolbar>
        <Button type="button" variant="default" onClick={() => void saveIdentityAndWorkforce()} disabled={saving}>{saving ? "Saving…" : "Save profile updates"}</Button>
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </AdminToolbar>
    </AdminPageShell>
  );
}
