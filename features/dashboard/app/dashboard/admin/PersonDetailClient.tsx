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
    open_period_entries: number;
    blocking_exceptions: number;
    warning_exceptions: number;
  };
  audit_preview: Array<{ id: string; action: string | null; created_at: string | null; target: string | null }>;
  certifications: Certification[];
};

export default function PersonDetailClient({ personId }: { personId: string }) {
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newCert, setNewCert] = useState({ cert_name: "", cert_type: "certification", status: "active" as Certification["status"] });

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

  async function saveIdentityAndWorkforce() {
    if (!detail) return;
    setSaving(true);
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
    const res = await fetch(`/api/admin/people/${personId}/certifications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newCert),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to add certification");
      return;
    }
    setDetail((prev) => (prev ? { ...prev, certifications: [body.certification as Certification, ...prev.certifications] } : prev));
    setNewCert({ cert_name: "", cert_type: "certification", status: "active" });
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
          <AdminStatCard label="Onboarding" value={detail.completed_onboarding ? "Complete" : "Incomplete"} />
          <AdminStatCard label="Payroll blocking" value={detail.payroll_posture.blocking_exceptions} />
          <AdminStatCard label="Payroll warnings" value={detail.payroll_posture.warning_exceptions} />
          <AdminStatCard label="Open period rows" value={detail.payroll_posture.open_period_entries} />
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
        <div className="px-4 pb-4 text-xs text-neutral-300">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={detail.workforce_profile.payroll_ready} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, payroll_ready: e.target.checked } } : prev)} />
            Payroll/time-ready for active period processing
          </label>
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Certifications & Licensing" description="Track workforce credentials, expiry risk, and licence/certificate metadata." />
        <AdminToolbar>
          <AdminField label="Name" className="flex-1"><input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.cert_name} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_name: e.target.value }))} /></AdminField>
          <AdminField label="Type" className="w-full md:w-52"><input className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.cert_type} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_type: e.target.value }))} /></AdminField>
          <AdminField label="Status" className="w-full md:w-44"><select className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm" value={newCert.status} onChange={(e) => setNewCert((prev) => ({ ...prev, status: e.target.value as Certification["status"] }))}><option value="active">active</option><option value="pending">pending</option><option value="expired">expired</option><option value="revoked">revoked</option></select></AdminField>
          <Button type="button" variant="default" className="mt-5" onClick={() => void addCertification()}>Add credential</Button>
        </AdminToolbar>

        {detail.certifications.length === 0 ? (
          <AdminEmptyState title="No credentials yet" body="Add certifications/licenses so readiness and expiry posture are visible." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/30 text-xs uppercase tracking-[0.12em] text-neutral-400"><tr><th className="px-4 py-2.5 text-left">Credential</th><th className="px-4 py-2.5 text-left">Issuer</th><th className="px-4 py-2.5 text-left">Number</th><th className="px-4 py-2.5 text-left">Dates</th><th className="px-4 py-2.5 text-left">Status</th></tr></thead>
              <tbody className="divide-y divide-white/10">
                {detail.certifications.map((cert) => (
                  <tr key={cert.id} className="text-neutral-200">
                    <td className="px-4 py-2.5"><p className="font-medium text-neutral-100">{cert.cert_name}</p><p className="text-xs text-neutral-500">{cert.cert_type}</p></td>
                    <td className="px-4 py-2.5">{cert.issuing_body ?? "—"}</td>
                    <td className="px-4 py-2.5">{cert.cert_number ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">Issued: {cert.issue_date ?? "—"}<br />Expires: {cert.expiry_date ?? "—"}</td>
                    <td className="px-4 py-2.5"><AdminBadge>{cert.status}</AdminBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Payroll Time" description="Use this section to move directly into period review with this person in context." />
        <div className="flex flex-wrap items-center gap-3 p-4 text-xs">
          <AdminBadge>{detail.payroll_posture.blocking_exceptions} blocking exceptions</AdminBadge>
          <AdminBadge>{detail.payroll_posture.warning_exceptions} warnings</AdminBadge>
          <AdminBadge>{detail.payroll_posture.open_period_entries} open period entries</AdminBadge>
          <Link href={`/dashboard/admin/payroll-time?person_id=${detail.id}`} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-medium text-orange-300 hover:text-orange-200">Open Payroll Time →</Link>
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
                <p className="text-xs text-neutral-400">{row.created_at ? new Date(row.created_at).toLocaleString() : "Unknown time"} • {row.target ?? "No target"}</p>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>

      <AdminToolbar>
        <Button type="button" variant="default" onClick={() => void saveIdentityAndWorkforce()} disabled={saving}>{saving ? "Saving…" : "Save profile updates"}</Button>
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </AdminToolbar>
    </AdminPageShell>
  );
}
