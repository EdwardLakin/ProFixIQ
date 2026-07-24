"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

type DocsResponsePayload = {
  summary: { total: number; recent: number; needsReview: number; expired: number; expiringSoon: number };
  documents: WorkforceDocument[];
  generatedAt: string;
};

type RequirementRuleView = {
  key: string;
  workforceRole: string | null;
  workforceCategory: string | null;
  docType: string;
  label: string;
  required: boolean;
  expiresRequired: boolean;
  warningDays: number;
  priority: number;
};

type RequirementOverrideView = {
  id: string;
  workforceRole: string | null;
  workforceCategory: string | null;
  docType: string;
  label: string;
  isRequired: boolean;
  expiresRequired: boolean;
  warningDays: number;
  priority: number;
  isActive: boolean;
  acceptStatuses: string[];
  reviewStatuses: string[];
};

type RequirementsPayload = {
  defaults: RequirementRuleView[];
  overrides: RequirementOverrideView[];
  effective: RequirementRuleView[];
  generatedAt: string;
};

type MatrixPayload = {
  requirements: Array<{ key: string; workforceRole: string | null; workforceCategory: string | null; docType: string; label: string; required: true; expiresRequired: boolean; warningDays: number }>;
  readinessItems: Array<{ personId: string; personName: string; personEmail: string | null; workforceRole: string | null; workforceCategory: string | null; readiness: string; missingDocTypes: string[]; expiredDocTypes: string[]; expiringDocTypes: string[]; needsReviewDocTypes: string[]; href: string }>;
  missingByPerson: Array<{ personId: string; personName: string; missingDocTypes: string[]; href: string }>;
  missingByDocType: Array<{ docType: string; label: string; count: number }>;
  expiringRequired: Array<{ personId: string; personName: string; expiredDocTypes: string[]; expiringDocTypes: string[]; href: string }>;
  summary: { activePeople: number; ready: number; missingRequired: number; expiredRequired: number; needsReview: number; expiringSoon: number };
  generatedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
};
const safeString = (value: unknown): string => (typeof value === "string" ? value : "");
const asStringArray = (value: unknown): string[] => asArray<unknown>(value).map((item) => safeString(item)).filter(Boolean);

const normalizeScopeChip = (workforceRole: string | null, workforceCategory: string | null): string => {
  if (workforceRole && workforceCategory) return "Role+Category";
  if (workforceRole) return "Role";
  if (workforceCategory) return "Category";
  return "Global";
};

const normalizeRequirementsPayload = (value: unknown): { data: RequirementsPayload | null; error: string | null } => {
  if (!isRecord(value)) return { data: null, error: "Malformed requirements payload." };

  const toRule = (item: unknown, idx: number): RequirementRuleView => {
    const row = isRecord(item) ? item : {};
    return {
      key: safeString(row.key) || `rule-${idx}`,
      workforceRole: safeString(row.workforceRole) || null,
      workforceCategory: safeString(row.workforceCategory) || null,
      docType: safeString(row.docType) || "other",
      label: safeString(row.label) || safeString(row.docType) || "Document",
      required: row.required === false ? false : true,
      expiresRequired: Boolean(row.expiresRequired),
      warningDays: num(row.warningDays),
      priority: num(row.priority),
    };
  };

  const toOverride = (item: unknown, idx: number): RequirementOverrideView => {
    const row = isRecord(item) ? item : {};
    return {
      id: safeString(row.id) || `override-${idx}`,
      workforceRole: safeString(row.workforce_role) || null,
      workforceCategory: safeString(row.workforce_category) || null,
      docType: safeString(row.doc_type) || "other",
      label: safeString(row.label) || safeString(row.doc_type) || "Document",
      isRequired: row.is_required === false ? false : true,
      expiresRequired: Boolean(row.expires_required),
      warningDays: num(row.expires_warning_days),
      priority: num(row.priority),
      isActive: row.is_active === false ? false : true,
      acceptStatuses: asStringArray(row.accept_statuses),
      reviewStatuses: asStringArray(row.review_statuses),
    };
  };

  return {
    data: {
      defaults: asArray<unknown>(value.defaults).map(toRule),
      overrides: asArray<unknown>(value.overrides).map(toOverride),
      effective: asArray<unknown>(value.effective).map(toRule),
      generatedAt: safeString(value.generatedAt),
    },
    error: null,
  };
};

const normalizeMatrixPayload = (value: unknown): { matrix: MatrixPayload | null; error: string | null } => {
  if (!isRecord(value)) {
    return { matrix: null, error: "Malformed matrix payload." };
  }

  const summaryRaw = isRecord(value.summary) ? value.summary : {};
  const normalized: MatrixPayload = {
    summary: {
      activePeople: num(summaryRaw.activePeople),
      ready: num(summaryRaw.ready),
      missingRequired: num(summaryRaw.missingRequired),
      expiredRequired: num(summaryRaw.expiredRequired),
      needsReview: num(summaryRaw.needsReview),
      expiringSoon: num(summaryRaw.expiringSoon),
    },
    requirements: asArray<unknown>(value.requirements).map((item, idx) => {
      const row = isRecord(item) ? item : {};
      const key = safeString(row.key) || `requirement-${idx}`;
      return {
        key,
        workforceRole: safeString(row.workforceRole) || null,
        workforceCategory: safeString(row.workforceCategory) || null,
        docType: safeString(row.docType),
        label: safeString(row.label) || safeString(row.docType) || "Document",
        required: true,
        expiresRequired: Boolean(row.expiresRequired),
        warningDays: num(row.warningDays),
      };
    }),
    readinessItems: asArray<unknown>(value.readinessItems).map((item, idx) => {
      const row = isRecord(item) ? item : {};
      return {
        personId: safeString(row.personId) || `person-${idx}`,
        personName: safeString(row.personName) || "Unknown",
        personEmail: safeString(row.personEmail) || null,
        workforceRole: safeString(row.workforceRole) || null,
        workforceCategory: safeString(row.workforceCategory) || null,
        readiness: safeString(row.readiness) || "ready",
        missingDocTypes: asStringArray(row.missingDocTypes),
        expiredDocTypes: asStringArray(row.expiredDocTypes),
        expiringDocTypes: asStringArray(row.expiringDocTypes),
        needsReviewDocTypes: asStringArray(row.needsReviewDocTypes),
        href: safeString(row.href) || "/dashboard/workforce/people",
      };
    }),
    missingByPerson: asArray<unknown>(value.missingByPerson).map((item, idx) => {
      const row = isRecord(item) ? item : {};
      return {
        personId: safeString(row.personId) || `missing-person-${idx}`,
        personName: safeString(row.personName) || "Unknown",
        missingDocTypes: asStringArray(row.missingDocTypes),
        href: safeString(row.href) || "/dashboard/workforce/people",
      };
    }),
    missingByDocType: asArray<unknown>(value.missingByDocType).map((item) => {
      const row = isRecord(item) ? item : {};
      return {
        docType: safeString(row.docType),
        label: safeString(row.label) || safeString(row.docType) || "Document",
        count: num(row.count),
      };
    }),
    expiringRequired: asArray<unknown>(value.expiringRequired).map((item, idx) => {
      const row = isRecord(item) ? item : {};
      return {
        personId: safeString(row.personId) || `expiring-person-${idx}`,
        personName: safeString(row.personName) || "Unknown",
        expiredDocTypes: asStringArray(row.expiredDocTypes),
        expiringDocTypes: asStringArray(row.expiringDocTypes),
        href: safeString(row.href) || "/dashboard/workforce/people",
      };
    }),
    generatedAt: safeString(value.generatedAt),
  };

  const hasRenderableMatrixData =
    normalized.requirements.length > 0 ||
    normalized.readinessItems.length > 0 ||
    normalized.missingByPerson.length > 0 ||
    normalized.expiringRequired.length > 0;
  if (!hasRenderableMatrixData) {
    return { matrix: null, error: "Matrix payload malformed or empty." };
  }
  return { matrix: normalized, error: null };
};

export default function WorkforceDocumentsClient() {
  const [data, setData] = useState<DocsResponsePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<MatrixPayload | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [requirements, setRequirements] = useState<RequirementsPayload | null>(null);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [managerMessage, setManagerMessage] = useState<string | null>(null);
  const [managerError, setManagerError] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null);
  const [overrideForm, setOverrideForm] = useState({
    workforce_role: "",
    workforce_category: "",
    doc_type: "",
    label: "",
    is_required: true,
    expires_required: false,
    expires_warning_days: "0",
    accept_statuses: "",
    review_statuses: "",
    priority: "100",
    is_active: true,
  });
  const searchParams = useSearchParams();
  const requirementsMode = searchParams.get("mode") === "requirements";

  const fetchRequirements = async () => {
    const requirementsRes = await fetch("/api/workforce/document-requirements", { cache: "no-store" });
    const requirementsJson = await requirementsRes.json().catch(() => null);
    if (!requirementsRes.ok) {
      const reqError = isRecord(requirementsJson) ? safeString(requirementsJson.error) : "";
      setRequirementsError(reqError || "Failed loading requirements manager");
      return;
    }
    const normalizedReq = normalizeRequirementsPayload(requirementsJson);
    setRequirements(normalizedReq.data);
    setRequirementsError(normalizedReq.error);
  };

  const fetchMatrix = async () => {
    const matrixRes = await fetch("/api/workforce/document-requirements/readiness", { cache: "no-store" });
    const matrixJson = await matrixRes.json();
    if (!matrixRes.ok) {
      setMatrixError(matrixJson?.error || "Failed loading matrix readiness");
      return;
    }
    const normalized = normalizeMatrixPayload(matrixJson);
    setMatrix(normalized.matrix);
    setMatrixError(normalized.error);
  };

  useEffect(() => {
    const run = async () => {
      try {
        const [docsRes] = await Promise.all([
          fetch("/api/workforce/documents-readiness", { cache: "no-store" }),
        ]);
        const docsJson = await docsRes.json();
        if (!docsRes.ok) throw new Error(docsJson?.error || "Failed loading documents readiness");
        setData(docsJson);
        await Promise.all([fetchMatrix(), fetchRequirements()]);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const applyOverrideToForm = (row: RequirementOverrideView | null) => {
    setOverrideForm({
      workforce_role: row?.workforceRole ?? "",
      workforce_category: row?.workforceCategory ?? "",
      doc_type: row?.docType ?? "",
      label: row?.label ?? "",
      is_required: row?.isRequired ?? true,
      expires_required: row?.expiresRequired ?? false,
      expires_warning_days: String(row?.warningDays ?? 0),
      accept_statuses: (row?.acceptStatuses ?? []).join(","),
      review_statuses: (row?.reviewStatuses ?? []).join(","),
      priority: String(row?.priority ?? 100),
      is_active: row?.isActive ?? true,
    });
  };

  const mapApiError = (status: number, payload: unknown): string => {
    const serverCode = isRecord(payload) ? safeString(payload.code) : "";
    const serverError = isRecord(payload) ? safeString(payload.error) : "";
    const serverMessage = isRecord(payload) ? safeString(payload.message) : "";
    const conflictText = `${serverError} ${serverMessage}`.toLowerCase();
    const isActiveOverrideConflict =
      serverCode === "ACTIVE_OVERRIDE_CONFLICT" ||
      serverError === "ACTIVE_OVERRIDE_CONFLICT" ||
      (status === 409 && conflictText.includes("active override already exists"));
    if (isActiveOverrideConflict) return "An active override already exists for this role/category/doc type scope.";
    if (status === 401 || status === 403) return "You do not have permission to manage requirements.";
    if (status === 400) return serverError || "Validation failed. Please review your input.";
    return serverError || "Network or server error while saving override.";
  };

  const normalizedDuplicateKey = (workforceRole: string, workforceCategory: string, docType: string) =>
    `${workforceRole.trim().toLowerCase()}::${workforceCategory.trim().toLowerCase()}::${docType.trim().toLowerCase()}`;

  const duplicateActiveOverride = useMemo(() => {
    const key = normalizedDuplicateKey(overrideForm.workforce_role, overrideForm.workforce_category, overrideForm.doc_type);
    if (!key.replaceAll(":", "").trim()) return null;
    return requirements?.overrides.find((row) => {
      if (!row.isActive) return false;
      if (editingOverrideId && row.id === editingOverrideId) return false;
      return key === normalizedDuplicateKey(row.workforceRole ?? "", row.workforceCategory ?? "", row.docType);
    }) ?? null;
  }, [editingOverrideId, overrideForm.doc_type, overrideForm.workforce_category, overrideForm.workforce_role, requirements?.overrides]);

  const saveOverride = async () => {
    setSavingOverride(true);
    setManagerError(null);
    setManagerMessage(null);
    try {
      const payload = {
        workforce_role: overrideForm.workforce_role.trim() || null,
        workforce_category: overrideForm.workforce_category.trim() || null,
        doc_type: overrideForm.doc_type.trim(),
        label: overrideForm.label.trim(),
        is_required: overrideForm.is_required,
        expires_required: overrideForm.expires_required,
        expires_warning_days: Number(overrideForm.expires_warning_days),
        accept_statuses: overrideForm.accept_statuses.split(",").map((s) => s.trim()).filter(Boolean),
        review_statuses: overrideForm.review_statuses.split(",").map((s) => s.trim()).filter(Boolean),
        priority: Number(overrideForm.priority),
        is_active: overrideForm.is_active,
      };
      const isEdit = Boolean(editingOverrideId);
      const url = isEdit ? `/api/workforce/document-requirements/${editingOverrideId}` : "/api/workforce/document-requirements";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(mapApiError(res.status, json));
      await Promise.all([fetchRequirements(), fetchMatrix()]);
      setManagerMessage(isEdit ? "Override updated." : "Override created.");
      setShowOverrideForm(false);
      setEditingOverrideId(null);
    } catch (err) {
      setManagerError((err as Error).message);
    } finally {
      setSavingOverride(false);
    }
  };

  const disableOverride = async (id: string) => {
    setManagerError(null);
    setManagerMessage(null);
    const res = await fetch(`/api/workforce/document-requirements/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setManagerError(mapApiError(res.status, json));
      return;
    }
    await Promise.all([fetchRequirements(), fetchMatrix()]);
    setManagerMessage("Override disabled. Overrides are disabled, not deleted.");
  };

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

  const byRole = useMemo(() => {
    const map = new Map<string, { role: string; total: number; missing: number; expired: number; needsReview: number; expiring: number; ready: number }>();
    for (const item of matrix?.readinessItems ?? []) {
      const role = item.workforceRole ?? item.workforceCategory ?? "unassigned";
      const current = map.get(role) ?? { role, total: 0, missing: 0, expired: 0, needsReview: 0, expiring: 0, ready: 0 };
      current.total += 1;
      if (item.readiness === "missing_required") current.missing += 1;
      else if (item.readiness === "expired_required") current.expired += 1;
      else if (item.readiness === "needs_review") current.needsReview += 1;
      else if (item.readiness === "expiring_soon") current.expiring += 1;
      else current.ready += 1;
      map.set(role, current);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [matrix]);

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
    <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]">
      <table className="min-w-full text-sm text-[color:var(--theme-text-primary)]"><thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]"><tr><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Uploaded</th><th className="px-3 py-2 text-left">Expires</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody>{rows.map((doc) => <tr key={doc.id} className="border-t border-[color:var(--theme-border-soft)]"><td className="px-3 py-2 capitalize">{(doc.docType ?? "other").replaceAll("_", " ")}</td><td className="px-3 py-2">{doc.status ?? "—"}</td><td className="px-3 py-2">{doc.personName ?? "Unknown"}<div className="text-xs text-[color:var(--theme-text-secondary)]">{doc.personEmail ?? doc.userId}</div></td><td className="px-3 py-2">{doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}</td><td className="px-3 py-2">{doc.expiresAt ? new Date(doc.expiresAt).toLocaleDateString() : "—"}</td><td className="px-3 py-2 text-right"><button onClick={() => void openDoc(doc)} className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 hover:bg-[color:var(--theme-surface-subtle)]">Open secure link</button></td></tr>)}{rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-4 text-center text-[color:var(--theme-text-secondary)]">No documents in this section yet. Uploads will appear here once received.</td></tr> : null}</tbody></table>
    </div>
  );



  const renderRequirementRows = (rows: RequirementRuleView[]) => (
    <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"><table className="min-w-full text-sm text-[color:var(--theme-text-primary)]"><thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]"><tr><th className="px-3 py-2 text-left">Scope</th><th className="px-3 py-2 text-left">Doc Type</th><th className="px-3 py-2 text-left">Label</th><th className="px-3 py-2 text-left">Required</th><th className="px-3 py-2 text-left">Expiry</th><th className="px-3 py-2 text-left">Warning</th><th className="px-3 py-2 text-left">Priority</th></tr></thead><tbody>{rows.map((r) => <tr key={r.key} className="border-t border-[color:var(--theme-border-soft)]"><td className="px-3 py-2"><span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-xs mr-2">{normalizeScopeChip(r.workforceRole, r.workforceCategory)}</span>{r.workforceRole ?? "—"}/{r.workforceCategory ?? "—"}</td><td className="px-3 py-2 capitalize">{r.docType.replaceAll("_", " ")}</td><td className="px-3 py-2">{r.label}</td><td className="px-3 py-2">{r.required ? "Yes" : "No"}</td><td className="px-3 py-2">{r.expiresRequired ? "Required" : "Not required"}</td><td className="px-3 py-2">{r.warningDays}d</td><td className="px-3 py-2">{r.priority}</td></tr>)}{rows.length === 0 ? <tr><td colSpan={7} className="px-3 py-4 text-center text-[color:var(--theme-text-secondary)]">No rows to display.</td></tr> : null}</tbody></table></div>
  );

  const renderOverrideRows = (rows: RequirementOverrideView[]) => (
    <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"><table className="min-w-full text-sm text-[color:var(--theme-text-primary)]"><thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]"><tr><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Scope</th><th className="px-3 py-2 text-left">Doc Type</th><th className="px-3 py-2 text-left">Label</th><th className="px-3 py-2 text-left">Required</th><th className="px-3 py-2 text-left">Expiry</th><th className="px-3 py-2 text-left">Warning</th><th className="px-3 py-2 text-left">Priority</th><th className="px-3 py-2 text-right">Actions</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t border-[color:var(--theme-border-soft)]"><td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${r.isActive ? "bg-emerald-500/20 text-[color:var(--theme-success-text)]" : "bg-[color:var(--theme-surface-hover)] text-[color:var(--theme-text-secondary)]"}`}>{r.isActive ? "Active" : "Inactive"}</span></td><td className="px-3 py-2"><span className="rounded-full bg-[color:var(--theme-surface-subtle)] px-2 py-0.5 text-xs mr-2">{normalizeScopeChip(r.workforceRole, r.workforceCategory)}</span>{r.workforceRole ?? "—"}/{r.workforceCategory ?? "—"}</td><td className="px-3 py-2 capitalize">{r.docType.replaceAll("_", " ")}</td><td className="px-3 py-2">{r.label}</td><td className="px-3 py-2">{r.isRequired ? "Yes" : "No"}</td><td className="px-3 py-2">{r.expiresRequired ? "Required" : "Not required"}</td><td className="px-3 py-2">{r.warningDays}d</td><td className="px-3 py-2">{r.priority}</td><td className="px-3 py-2 text-right"><button className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 hover:bg-[color:var(--theme-surface-subtle)]" onClick={() => { setShowOverrideForm(true); setEditingOverrideId(r.id); setShowAdvanced(true); applyOverrideToForm(r); }}>Edit</button>{r.isActive ? <button className="ml-2 rounded border border-red-400/40 px-2 py-1 text-[color:var(--theme-danger-text)] hover:bg-red-500/20" onClick={() => void disableOverride(r.id)}>Disable</button> : null}</td></tr>)}{rows.length === 0 ? <tr><td colSpan={9} className="px-3 py-4 text-center text-[color:var(--theme-text-secondary)]">No shop overrides yet.</td></tr> : null}</tbody></table></div>
  );

  if (loading) return <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-5 text-[color:var(--theme-text-secondary)]">Loading Documents Command…</div>;
  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-[color:var(--theme-danger-text)]">{error}</div>;

  return <div className="space-y-5">
    <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 shadow-[var(--theme-shadow-soft)]"><h1 className="text-2xl font-semibold text-[color:var(--theme-text-primary)]">Documents</h1><p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">Workforce readiness for document collection and compliance.</p><p className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">Signed document access opens a short-lived secure link. Add employee-specific records from the person workspace.</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><Link href="/dashboard/workforce/people" className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 text-[color:var(--theme-accent-text)]">Open People</Link><Link href={requirementsMode ? "/dashboard/workforce/documents" : "/dashboard/workforce/documents?mode=requirements"} className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 text-[color:var(--theme-info-text)]">{requirementsMode ? "Back to documents" : "Manage requirements"}</Link></div></div>
    <div className="grid gap-3 sm:grid-cols-5">{Object.entries({ Total: data?.summary.total ?? 0, Recent: data?.summary.recent ?? 0, "Needs Review": data?.summary.needsReview ?? 0, Expired: data?.summary.expired ?? 0, "Expiring Soon": data?.summary.expiringSoon ?? 0 }).map(([k, v]) => <div key={k} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"><div className="text-xs text-[color:var(--theme-text-secondary)]">{k}</div><div className="text-xl font-semibold text-[color:var(--theme-text-primary)]">{v}</div></div>)}</div>


    {requirementsMode ? <section className="space-y-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
      <h2 className="text-base font-semibold text-[color:var(--theme-info-text)]">Requirements Manager</h2>
      <p className="text-xs text-[color:var(--theme-info-text)]">System defaults apply unless an active shop override exists.</p>
      <p className="text-xs text-[color:var(--theme-info-text)]">Inactive overrides are ignored; defaults continue to apply.</p>
      <p className="text-xs text-[color:var(--theme-info-text)]">Overrides are disabled, not deleted.</p>
      <div><button className="rounded border border-cyan-500/40 px-3 py-1 text-sm text-[color:var(--theme-info-text)] hover:bg-cyan-500/10" onClick={() => { setShowOverrideForm(true); setEditingOverrideId(null); setShowAdvanced(false); applyOverrideToForm(null); }}>Create override</button></div>
      {managerMessage ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-[color:var(--theme-success-text)]">{managerMessage}</div> : null}
      {managerError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-[color:var(--theme-danger-text)]">{managerError}</div> : null}
      {showOverrideForm ? <div className="space-y-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
        <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">{editingOverrideId ? "Edit override" : "Create override"}</div><p className="text-xs text-[color:var(--theme-text-secondary)]">System defaults apply unless an active shop override exists.</p><p className="text-xs text-[color:var(--theme-text-secondary)]">Inactive overrides are ignored; defaults continue to apply.</p><p className="text-xs text-[color:var(--theme-text-secondary)]">Overrides are disabled, not deleted.</p>
        {duplicateActiveOverride ? <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-[color:var(--theme-warning-text)]">Warning: an active override already exists for this role/category/doc type scope.</div> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Workforce role" value={overrideForm.workforce_role} onChange={(e) => setOverrideForm((prev) => ({ ...prev, workforce_role: e.target.value }))} />
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Workforce category" value={overrideForm.workforce_category} onChange={(e) => setOverrideForm((prev) => ({ ...prev, workforce_category: e.target.value }))} />
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Document type" value={overrideForm.doc_type} onChange={(e) => setOverrideForm((prev) => ({ ...prev, doc_type: e.target.value }))} />
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Display label" value={overrideForm.label} onChange={(e) => setOverrideForm((prev) => ({ ...prev, label: e.target.value }))} />
          <label className="flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]"><input type="checkbox" checked={overrideForm.expires_required} onChange={(e) => setOverrideForm((prev) => ({ ...prev, expires_required: e.target.checked }))} />Expiration required</label>
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Expiration warning window (days)" value={overrideForm.expires_warning_days} onChange={(e) => setOverrideForm((prev) => ({ ...prev, expires_warning_days: e.target.value }))} />
          <label className="flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]"><input type="checkbox" checked={overrideForm.is_active} onChange={(e) => setOverrideForm((prev) => ({ ...prev, is_active: e.target.checked }))} />Active override</label>
        </div>
        <button className="text-xs text-[color:var(--theme-info-text)] underline" onClick={() => setShowAdvanced((v) => !v)}>{showAdvanced ? "Hide advanced fields" : "Show advanced fields"}</button>
        {showAdvanced ? <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]"><input type="checkbox" checked={overrideForm.is_required} onChange={(e) => setOverrideForm((prev) => ({ ...prev, is_required: e.target.checked }))} />Required</label>
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Priority" value={overrideForm.priority} onChange={(e) => setOverrideForm((prev) => ({ ...prev, priority: e.target.value }))} />
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Accepted statuses (comma-separated)" value={overrideForm.accept_statuses} onChange={(e) => setOverrideForm((prev) => ({ ...prev, accept_statuses: e.target.value }))} />
          <input className="rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-sm" placeholder="Review statuses (comma-separated)" value={overrideForm.review_statuses} onChange={(e) => setOverrideForm((prev) => ({ ...prev, review_statuses: e.target.value }))} />
        </div> : null}
        <div className="flex gap-2"><button disabled={savingOverride} className="rounded border border-emerald-500/40 px-3 py-1 text-sm text-[color:var(--theme-success-text)] disabled:opacity-50" onClick={() => void saveOverride()}>{savingOverride ? "Saving..." : editingOverrideId ? "Save changes" : "Create override"}</button><button className="rounded border border-[color:var(--theme-border-soft)] px-3 py-1 text-sm" onClick={() => { setShowOverrideForm(false); setEditingOverrideId(null); }}>Cancel</button></div>
      </div> : null}
      {requirementsError ? <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-[color:var(--theme-warning-text)]">Requirements manager unavailable: {requirementsError}</div> : null}
      {requirements ? <>
        <section className="space-y-2"><h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Defaults</h3><p className="text-xs text-[color:var(--theme-text-secondary)]">System defaults apply unless an active shop override exists.</p>{renderRequirementRows(requirements.defaults)}</section>
        <section className="space-y-2"><h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Shop Overrides</h3><p className="text-xs text-[color:var(--theme-text-secondary)]">Inactive overrides are ignored; defaults continue to apply.</p>{renderOverrideRows(requirements.overrides)}</section>
        <section className="space-y-2"><h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Effective Requirements</h3><p className="text-xs text-[color:var(--theme-text-secondary)]">Effective requirements are the rules currently used by readiness scoring.</p>{renderRequirementRows(requirements.effective)}</section>
      </> : <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-secondary)]">Loading requirements manager…</div>}
    </section> : null}

    {matrixError ? <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-[color:var(--theme-warning-text)]">Required Matrix readiness unavailable: {matrixError}</div> : null}
    {matrix ? <>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[color:var(--theme-info-text)]">Required Matrix</h2>
        <div className="grid gap-3 sm:grid-cols-6">{Object.entries({ "Active People": matrix.summary.activePeople, Ready: matrix.summary.ready, Missing: matrix.summary.missingRequired, Expired: matrix.summary.expiredRequired, "Needs Review": matrix.summary.needsReview, "Expiring Soon": matrix.summary.expiringSoon }).map(([k, v]) => <div key={k} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"><div className="text-xs text-[color:var(--theme-text-secondary)]">{k}</div><div className="text-xl font-semibold text-[color:var(--theme-text-primary)]">{v}</div></div>)}</div>
        <div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"><table className="min-w-full text-sm text-[color:var(--theme-text-primary)]"><thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]"><tr><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Document</th><th className="px-3 py-2 text-left">Expires Required</th></tr></thead><tbody>{matrix.requirements.map((r) => <tr key={r.key} className="border-t border-[color:var(--theme-border-soft)]"><td className="px-3 py-2">{r.workforceRole ?? "—"}</td><td className="px-3 py-2">{r.workforceCategory ?? "—"}</td><td className="px-3 py-2">{r.label}</td><td className="px-3 py-2">{r.expiresRequired ? `Yes (${r.warningDays}d warning)` : "No"}</td></tr>)}</tbody></table></div>
      </section>

      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-accent-text)]">Missing Required</h2><div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"><table className="min-w-full text-sm text-[color:var(--theme-text-primary)]"><thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]"><tr><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Missing Types</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody>{matrix.missingByPerson.map((row) => <tr key={row.personId} className="border-t border-[color:var(--theme-border-soft)]"><td className="px-3 py-2">{row.personName}</td><td className="px-3 py-2 capitalize">{row.missingDocTypes.join(", ").replaceAll("_", " ")}</td><td className="px-3 py-2 text-right"><Link className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 hover:bg-[color:var(--theme-surface-subtle)]" href={row.href}>Open</Link></td></tr>)}{matrix.missingByPerson.length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-center text-[color:var(--theme-text-secondary)]">No missing required documents.</td></tr> : null}</tbody></table></div></section>

      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-warning-text)]">Expiring Required</h2><div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"><table className="min-w-full text-sm text-[color:var(--theme-text-primary)]"><thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]"><tr><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Expired Types</th><th className="px-3 py-2 text-left">Expiring Soon Types</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody>{matrix.expiringRequired.map((row) => <tr key={row.personId} className="border-t border-[color:var(--theme-border-soft)]"><td className="px-3 py-2">{row.personName}</td><td className="px-3 py-2 capitalize">{row.expiredDocTypes.join(", ").replaceAll("_", " ") || "—"}</td><td className="px-3 py-2 capitalize">{row.expiringDocTypes.join(", ").replaceAll("_", " ") || "—"}</td><td className="px-3 py-2 text-right"><Link className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 hover:bg-[color:var(--theme-surface-subtle)]" href={row.href}>Open</Link></td></tr>)}{matrix.expiringRequired.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-[color:var(--theme-text-secondary)]">No expiring required documents.</td></tr> : null}</tbody></table></div></section>

      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-info-text)]">By Role</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{byRole.map((row) => <div key={row.role} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm"><div className="font-semibold capitalize text-[color:var(--theme-text-primary)]">{row.role.replaceAll("_", " ")}</div><div className="mt-2 text-[color:var(--theme-text-secondary)]">Total: {row.total} · Ready: {row.ready}</div><div className="text-[color:var(--theme-text-secondary)]">Missing: {row.missing} · Expired: {row.expired} · Review: {row.needsReview} · Expiring: {row.expiring}</div></div>)}</div></section>

      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-success-text)]">By Person Readiness</h2><div className="overflow-hidden rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)]"><table className="min-w-full text-sm text-[color:var(--theme-text-primary)]"><thead className="bg-[color:var(--theme-surface-subtle)] text-xs uppercase tracking-wide text-[color:var(--theme-text-secondary)]"><tr><th className="px-3 py-2 text-left">Person</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-left">Readiness</th><th className="px-3 py-2 text-left">Flags</th><th className="px-3 py-2 text-right">Action</th></tr></thead><tbody>{matrix.readinessItems.map((row) => <tr key={row.personId} className="border-t border-[color:var(--theme-border-soft)]"><td className="px-3 py-2">{row.personName}</td><td className="px-3 py-2">{row.workforceRole ?? row.workforceCategory ?? "—"}</td><td className="px-3 py-2 capitalize">{row.readiness.replaceAll("_", " ")}</td><td className="px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">M:{row.missingDocTypes.length} E:{row.expiredDocTypes.length} R:{row.needsReviewDocTypes.length} S:{row.expiringDocTypes.length}</td><td className="px-3 py-2 text-right"><Link className="rounded border border-[color:var(--theme-border-soft)] px-2 py-1 hover:bg-[color:var(--theme-surface-subtle)]" href={row.href}>Open</Link></td></tr>)}{matrix.readinessItems.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-[color:var(--theme-text-secondary)]">No active workforce people found.</td></tr> : null}</tbody></table></div></section>
    </> : null}

    <div className="space-y-4">
      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-accent-text)]">Needs Review</h2>{renderRows(sections.needsReview)}</section>
      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-warning-text)]">Expiring Soon</h2>{renderRows(sections.expiringSoon)}</section>
      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-danger-text)]">Expired</h2>{renderRows(sections.expired)}</section>
      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-info-text)]">Recent Uploads</h2>{renderRows(sections.recent)}</section>
      <section><h2 className="mb-2 text-sm font-semibold text-[color:var(--theme-text-primary)]">All Documents</h2>{renderRows(sections.all)}</section>
    </div>
  </div>;
}
