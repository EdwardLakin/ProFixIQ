"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@shared/components/ui/Button";
import {
  AdminBadge,
  AdminEmptyState,
  AdminField,
  AdminPageHeader,
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
  days_remaining?: number | null;
  lifecycle_group?: "expired" | "expiring_soon" | "active";
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
  schedule_posture: {
    has_recurring_schedule: boolean;
    recurring_rows: number;
    upcoming_override_count: number;
    upcoming_approved_away_count: number;
    next_override: { schedule_date?: string | null } | null;
    next_away_block: { starts_at?: string | null; block_type?: string | null } | null;
  };
  upcoming_time_off: Array<{ id: string; starts_at: string; ends_at: string; block_type: string; label?: string | null }>;
  recent_time_off_requests: Array<{ id: string; status: string; starts_at: string; ends_at: string; request_type: string; reason?: string | null }>;
  needs_action: boolean;
  action_reasons: Array<{
    code: string;
    severity: "blocking" | "warning" | "informational";
    label: string;
    action_label: string;
    action_href: string;
  }>;
  action_counts: { blocking: number; warning: number; informational: number };
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

const APP_ROLE_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "foreman", label: "Foreman" },
  { value: "lead_hand", label: "Lead Hand" },
  { value: "advisor", label: "Advisor" },
  { value: "service", label: "Service" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "parts", label: "Parts" },
  { value: "mechanic", label: "Mechanic / Technician" },
  { value: "fleet_manager", label: "Fleet Manager" },
  { value: "driver", label: "Driver" },
  { value: "customer", label: "Customer" },
] as const;

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

function statusTone(status: "active" | "inactive" | "on_leave") {
  if (status === "inactive") return "text-[color:var(--theme-danger-text)]";
  if (status === "on_leave") return "text-[color:var(--theme-warning-text)]";
  return "text-[color:var(--theme-success-text)]";
}

export default function PersonDetailClient({ personId, from }: { personId: string; from?: string | null }) {
  const searchParams = useSearchParams();
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [persistedRole, setPersistedRole] = useState<string | null>(null);
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
      setPersistedRole((body as PersonDetail).role ?? null);
    })();
  }, [personId]);

  const missingChecklist = useMemo(() => {
    if (!detail) return [];
    const items: string[] = [];
    if (!detail.phone) items.push("Phone number");
    if (!detail.role) items.push("Identity role assignment");
    if (!detail.completed_onboarding) items.push("Profile setup completion");
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

  const groupedCertifications = useMemo(() => {
    if (!detail) return { expired: [] as Certification[], expiringSoon: [] as Certification[], active: [] as Certification[] };
    const groups = { expired: [] as Certification[], expiringSoon: [] as Certification[], active: [] as Certification[] };
    for (const cert of detail.certifications) {
      if (cert.lifecycle_group === "expired") groups.expired.push(cert);
      else if (cert.lifecycle_group === "expiring_soon") groups.expiringSoon.push(cert);
      else groups.active.push(cert);
    }
    return groups;
  }, [detail]);
  const fromContext = from ?? searchParams.get("from");
  const focusParam = searchParams.get("focus");
  const fromWorkforceOverview = fromContext === "workforce-overview" && focusParam === "workload";

  async function saveIdentityAndWorkforce() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      full_name: detail.full_name,
      phone: detail.phone,
      completed_onboarding: detail.completed_onboarding,
      workforce_profile: detail.workforce_profile,
    };
    if ((detail.role ?? null) !== (persistedRole ?? null)) {
      payload.role = detail.role;
    }
    const res = await fetch(`/api/admin/people/${personId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Save failed");
      setSaving(false);
      return;
    }
    const refreshed = await fetch(`/api/admin/people/${personId}`, { cache: "no-store" });
    const body = await refreshed.json().catch(() => null);
    if (refreshed.ok && body) {
      setDetail(body as PersonDetail);
      setPersistedRole((body as PersonDetail).role ?? null);
    }
    setSaving(false);
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
      <div className="space-y-4">
        <AdminEmptyState title="Loading person workspace" body="Pulling identity, workforce, certifications, payroll posture, and audit context." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        eyebrow="People Record Workspace"
        title={detail.full_name ?? "Person record"}
        subtitle="Manage identity/access, workforce profile, certifications/licensing, payroll posture, and activity from one canonical staff record."
      />
      {fromWorkforceOverview ? (
        <AdminPanel>
          <div className="px-4 py-3 text-xs text-[color:var(--theme-accent-text)]">Opened from Workforce Overview for workload review.</div>
        </AdminPanel>
      ) : null}

      {from === "create-user" ? (
        <AdminPanel>
          <AdminPanelTitle
            title="Account created successfully"
            description="This person is now provisioned for access and linked to the canonical People record. Continue setup here."
          />
          <div className="space-y-1 px-4 pb-4 text-xs text-[color:var(--theme-text-secondary)]">
            <p>Next actions:</p>
            <p>• Complete workforce profile (role/category/start date).</p>
            <p>• Add certifications/licensing if required.</p>
            <p>• Review payroll readiness when staffing details are complete.</p>
            <p>• Ask the user to sign in and finish personal profile details.</p>
          </div>
        </AdminPanel>
      ) : null}

      <div id="needs-action">
      <AdminPanel>
        <AdminPanelTitle
          title="Needs Action"
          description={detail.needs_action ? "Prioritized follow-up for this person. Resolve blocking issues first." : "No follow-up issues are currently open."}
        />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <AdminStatCard label="Blocking" value={detail.action_counts.blocking} />
          <AdminStatCard label="Warning" value={detail.action_counts.warning} />
          <AdminStatCard label="Informational" value={detail.action_counts.informational} />
        </div>
        {detail.needs_action ? (
          <div className="space-y-2 px-4 pb-4">
            {detail.action_reasons.map((reason, idx) => (
              <div key={`${reason.code}-${idx}`} className="flex flex-col gap-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className={`text-xs uppercase tracking-[0.16em] ${reason.severity === "blocking" ? "text-[color:var(--theme-danger-text)]" : reason.severity === "warning" ? "text-[color:var(--theme-warning-text)]" : "text-[color:var(--theme-info-text)]"}`}>{reason.severity}</p>
                  <p className="text-sm text-[color:var(--theme-text-primary)]">{reason.label}</p>
                </div>
                <Link href={reason.action_href} className="inline-flex rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-xs font-medium text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]">
                  {reason.action_label} →
                </Link>
              </div>
            ))}
          </div>
        ) : null}
      </AdminPanel>
      </div>

      <div id="workforce">
      <AdminPanel>
        <AdminPanelTitle title="Overview" description="Use this to see readiness posture before editing deeper sections." />
        <AdminStatGrid>
          <AdminStatCard label="Role" value={detail.role ?? "Unassigned"} />
          <AdminStatCard label="Employment" value={detail.workforce_profile.employment_status} hint={detail.workforce_profile.employment_status} />
          <AdminStatCard label="Payroll blocking" value={detail.payroll_posture.blocking_exceptions} />
          <AdminStatCard label="Expiring certs (30d)" value={certSummary.expiring30} />
          <AdminStatCard label="Expired certs" value={certSummary.expired} />
          <AdminStatCard label="Schedule rows" value={detail.schedule_posture.recurring_rows} />
          <AdminStatCard label="Upcoming time away" value={detail.schedule_posture.upcoming_approved_away_count} />
        </AdminStatGrid>
        <div className="p-4 text-xs text-[color:var(--theme-text-secondary)]">
          <p className="mb-2 font-medium text-[color:var(--theme-text-primary)]">Top missing items</p>
          {missingChecklist.length === 0 ? <p>Record is operationally complete.</p> : missingChecklist.map((item) => <p key={item}>• {item}</p>)}
        </div>
      </AdminPanel>
      </div>

      <AdminPanel>
        <AdminPanelTitle title="Schedule & Time Off Posture" description="Workforce scheduling posture tied to this canonical People record." />
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <AdminStatCard label="Recurring schedule" value={detail.schedule_posture.has_recurring_schedule ? "Configured" : "Missing"} />
          <AdminStatCard label="Overrides (next 2 weeks)" value={detail.schedule_posture.upcoming_override_count} />
          <AdminStatCard label="Approved away blocks" value={detail.schedule_posture.upcoming_approved_away_count} />
        </div>
        <div className="px-4 pb-4 text-xs text-[color:var(--theme-text-secondary)]">
          <p className="mb-2">Next actions:</p>
          <p>• <Link className="text-[color:var(--theme-accent-text)]" href="/dashboard/workforce/scheduling">Open scheduling board</Link></p>
          <p>• <Link className="text-[color:var(--theme-accent-text)]" href={`/dashboard/workforce/payroll-review?person_id=${personId}`}>Open payroll review</Link></p>
          {detail.recent_time_off_requests.slice(0, 3).map((request) => (
            <p key={request.id}>• {request.request_type} ({request.status}) {new Date(request.starts_at).toLocaleDateString()} → {new Date(request.ends_at).toLocaleDateString()}</p>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Identity & Access" description="Account governance belongs here: identity fields, role, and account posture." />
        <div className="px-4 pb-2">
          <AdminBadge>
            Employment status: <span className={statusTone(detail.workforce_profile.employment_status)}>{detail.workforce_profile.employment_status}</span>
          </AdminBadge>
        </div>
        <AdminToolbar>
          <AdminField label="Full name" className="flex-1">
            <input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={detail.full_name ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, full_name: e.target.value } : prev)} />
          </AdminField>
          <AdminField label="Email (source of truth)" className="flex-1">
            <input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-secondary)]" value={detail.email ?? ""} disabled />
          </AdminField>
          <AdminField label="Phone" className="flex-1">
            <input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={detail.phone ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, phone: e.target.value } : prev)} />
          </AdminField>
          <AdminField label="App role" className="w-full md:w-64">
            <select
              className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm"
              value={detail.role ?? ""}
              onChange={(e) => setDetail((prev) => (prev ? { ...prev, role: e.target.value || null } : prev))}
            >
              <option value="">Unassigned</option>
              {APP_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </AdminField>
        </AdminToolbar>
        <div className="px-4 pb-4 text-xs text-[color:var(--theme-text-secondary)]">
          App role controls access and permissions. Workforce role/title is managed separately.
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Workforce Profile" description="Employment posture, workforce category, and payroll readiness belong to workforce management." />
        <AdminToolbar>
          <AdminField label="Workforce role" className="flex-1">
            <input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={detail.workforce_profile.workforce_role ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, workforce_role: e.target.value } } : prev)} />
          </AdminField>
          <AdminField label="Category" className="flex-1">
            <input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={detail.workforce_profile.workforce_category ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, workforce_category: e.target.value } } : prev)} />
          </AdminField>
          <AdminField label="Employment status" className="w-full md:w-52">
            <select className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={detail.workforce_profile.employment_status} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, employment_status: e.target.value as "active" | "inactive" | "on_leave" } } : prev)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
            </select>
          </AdminField>
          <AdminField label="Start date" className="w-full md:w-52">
            <input type="date" className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={detail.workforce_profile.start_date ?? ""} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, start_date: e.target.value || null } } : prev)} />
          </AdminField>
        </AdminToolbar>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
            <input type="checkbox" checked={detail.workforce_profile.payroll_ready} onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, payroll_ready: e.target.checked } } : prev)} />
            Payroll/time-ready for active period processing
          </label>
          <textarea
            className="min-h-24 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-primary)]"
            placeholder="Employment status context / workforce notes"
            value={detail.workforce_profile.notes ?? ""}
            onChange={(e) => setDetail((prev) => prev ? { ...prev, workforce_profile: { ...prev.workforce_profile, notes: e.target.value } } : prev)}
          />
        </div>
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Certifications & Licensing" description="Track workforce credentials, edit records in place, and act on expiry risk." />
        <AdminToolbar>
          <AdminField label="Name" className="flex-1"><input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={newCert.cert_name} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_name: e.target.value }))} /></AdminField>
          <AdminField label="Type" className="w-full md:w-40"><input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={newCert.cert_type} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_type: e.target.value }))} /></AdminField>
          <AdminField label="Number" className="w-full md:w-40"><input className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={newCert.cert_number ?? ""} onChange={(e) => setNewCert((prev) => ({ ...prev, cert_number: e.target.value }))} /></AdminField>
          <AdminField label="Expiry" className="w-full md:w-44"><input type="date" className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={newCert.expiry_date ?? ""} onChange={(e) => setNewCert((prev) => ({ ...prev, expiry_date: e.target.value || null }))} /></AdminField>
          <AdminField label="Status" className="w-full md:w-40"><select className="w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm" value={newCert.status} onChange={(e) => setNewCert((prev) => ({ ...prev, status: e.target.value as Certification["status"] }))}><option value="active">active</option><option value="pending">pending</option><option value="expired">expired</option><option value="revoked">revoked</option></select></AdminField>
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
          <div id="certifications" className="overflow-x-auto">
            <div className="px-4 pb-2 text-xs text-[color:var(--theme-text-secondary)]">
              <p>Expired: {groupedCertifications.expired.length} • Expiring soon: {groupedCertifications.expiringSoon.length} • Active: {groupedCertifications.active.length}</p>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-[color:var(--theme-surface-inset)] text-xs uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]"><tr><th className="px-4 py-2.5 text-left">Credential</th><th className="px-4 py-2.5 text-left">Issuer</th><th className="px-4 py-2.5 text-left">Dates</th><th className="px-4 py-2.5 text-left">Posture</th><th className="px-4 py-2.5 text-left">Actions</th></tr></thead>
              <tbody className="divide-y divide-[color:var(--theme-border-soft)]">
                {[...groupedCertifications.expired, ...groupedCertifications.expiringSoon, ...groupedCertifications.active].map((cert) => (
                  <tr key={cert.id} className="text-[color:var(--theme-text-primary)]">
                    <td className="px-4 py-2.5"><p className="font-medium text-[color:var(--theme-text-primary)]">{cert.cert_name}</p><p className="text-xs text-[color:var(--theme-text-muted)]">{cert.cert_type} {cert.cert_number ? `• ${cert.cert_number}` : ""}</p></td>
                    <td className="px-4 py-2.5 text-xs">{cert.issuing_body ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">Issued: {cert.issue_date ?? "—"}<br />Expires: {cert.expiry_date ?? "—"}{typeof cert.days_remaining === "number" ? <><br />{cert.days_remaining >= 0 ? `${cert.days_remaining} days remaining` : `${Math.abs(cert.days_remaining)} days overdue`}</> : null}</td>
                    <td className="px-4 py-2.5"><AdminBadge>{certPosture(cert)}</AdminBadge></td>
                    <td className="px-4 py-2.5 text-xs">
                      <button
                        className="mr-3 text-[color:var(--theme-accent-text)] hover:text-[color:var(--theme-accent-text)]"
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
                      {(cert.lifecycle_group === "expired" || cert.lifecycle_group === "expiring_soon") ? (
                        <button
                          className="mr-3 text-[color:var(--theme-success-text)] hover:text-[color:var(--theme-success-text)]"
                          onClick={() => {
                            setEditingCertId(cert.id);
                            setEditingCert({
                              cert_type: cert.cert_type,
                              cert_name: cert.cert_name,
                              cert_number: cert.cert_number,
                              issuing_body: cert.issuing_body,
                              issue_date: cert.issue_date,
                              expiry_date: cert.expiry_date,
                              status: "active",
                              notes: cert.notes,
                            });
                          }}
                        >Mark renewed</button>
                      ) : null}
                      <button className="text-[color:var(--theme-danger-text)] hover:text-[color:var(--theme-danger-text)]" onClick={() => void deleteCertification(cert.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingCertId ? (
          <div className="m-4 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
            <p className="mb-2 text-sm font-medium text-[color:var(--theme-text-primary)]">Edit credential</p>
            <div className="grid gap-3 md:grid-cols-3">
              <input className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs" placeholder="Name" value={editingCert.cert_name} onChange={(e) => setEditingCert((prev) => ({ ...prev, cert_name: e.target.value }))} />
              <input className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs" placeholder="Type" value={editingCert.cert_type} onChange={(e) => setEditingCert((prev) => ({ ...prev, cert_type: e.target.value }))} />
              <select className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs" value={editingCert.status} onChange={(e) => setEditingCert((prev) => ({ ...prev, status: e.target.value as Certification["status"] }))}><option value="active">active</option><option value="pending">pending</option><option value="expired">expired</option><option value="revoked">revoked</option></select>
              <input className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs" placeholder="Number" value={editingCert.cert_number ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, cert_number: e.target.value }))} />
              <input className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs" placeholder="Issuing body" value={editingCert.issuing_body ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, issuing_body: e.target.value }))} />
              <input type="date" className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs" value={editingCert.expiry_date ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, expiry_date: e.target.value || null }))} />
            </div>
            <textarea className="mt-3 min-h-20 w-full rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs" placeholder="Notes" value={editingCert.notes ?? ""} onChange={(e) => setEditingCert((prev) => ({ ...prev, notes: e.target.value }))} />
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="default" onClick={() => void saveEditedCertification()} disabled={certSaving}>{certSaving ? "Saving…" : "Save certification"}</Button>
              <Button type="button" variant="ghost" onClick={() => setEditingCertId(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </AdminPanel>

      <div id="payroll-posture">
      <AdminPanel>
        <AdminPanelTitle title="Payroll Time Posture" description="Review payroll-readiness context before jumping into period approval/export." />
        <div className="grid gap-3 p-4 text-xs md:grid-cols-2">
          <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
            <p className="font-medium text-[color:var(--theme-text-primary)]">Readiness posture</p>
            <p className={`mt-1 font-medium ${detail.payroll_posture.is_payroll_ready ? "text-[color:var(--theme-success-text)]" : "text-[color:var(--theme-danger-text)]"}`}>{detail.payroll_posture.is_payroll_ready ? "Ready for payroll processing" : `Not payroll ready — ${Math.max(1, detail.payroll_posture.blocking_exceptions)} blocking issue${Math.max(1, detail.payroll_posture.blocking_exceptions) > 1 ? "s" : ""}`}</p>
            <p>{detail.payroll_posture.blocking_exceptions} blocking • {detail.payroll_posture.warning_exceptions} warning</p>
            <p>{detail.payroll_posture.in_current_period ? "Included in current open period" : "No open-period entries yet"}</p>
          </div>
          <div className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
            <p className="font-medium text-[color:var(--theme-text-primary)]">Missing data for review</p>
            {detail.payroll_posture.missing_workforce_data.length === 0 ? (
              <p>None.</p>
            ) : (
              detail.payroll_posture.missing_workforce_data.map((item) => <p key={item}>• {item}</p>)
            )}
            <Link href={`/dashboard/workforce/payroll-review?person_id=${detail.id}`} className="mt-2 inline-block rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 font-medium text-[color:var(--theme-accent-text)]">Fix payroll issues →</Link>
          </div>
        </div>
      </AdminPanel>
      </div>

      <AdminPanel>
        <AdminPanelTitle title="Activity" description="Recent governance events linked to this person record." action={<Link href="/dashboard/workforce/activity" className="text-xs font-medium text-[color:var(--theme-accent-text)]">Open full activity →</Link>} />
        {detail.audit_preview.length === 0 ? (
          <AdminEmptyState title="No recent activity" body="No audit trail rows matched this person in the latest window." />
        ) : (
          <div className="space-y-2 p-4 text-sm text-[color:var(--theme-text-secondary)]">
            {detail.audit_preview.map((row) => (
              <div key={row.id} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                <p className="font-medium text-[color:var(--theme-text-primary)]">{row.action ?? "event"}</p>
                <p className="text-xs text-[color:var(--theme-text-secondary)]">{row.created_at ? new Date(row.created_at).toLocaleString() : "Unknown time"} • target: {row.target ?? "—"} • actor: {row.actor_id ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
      </AdminPanel>

      <AdminPanel>
        <AdminPanelTitle title="Documents" description="Document workflows will be added once upload/index foundation lands in People." />
        <div className="p-4 text-xs text-[color:var(--theme-text-secondary)]">Documents are intentionally deferred in this pass to avoid placeholder-only records without retrieval and governance controls.</div>
      </AdminPanel>

      <AdminToolbar>
        <Button type="button" variant="default" onClick={() => void saveIdentityAndWorkforce()} disabled={saving}>{saving ? "Saving…" : "Save profile updates"}</Button>
        {error ? <span className="text-xs text-[color:var(--theme-danger-text)]">{error}</span> : null}
      </AdminToolbar>
    </div>
  );
}
