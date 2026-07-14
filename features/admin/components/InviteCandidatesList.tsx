// features/admin/components/InviteCandidatesList.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Database } from "@shared/types/types/supabase";
import { Button } from "@shared/components/ui/Button";

type DB = Database;
type UserRole = DB["public"]["Enums"]["user_role_enum"];

type CandidateRow = {
  id: string;
  shop_id: string;
  intake_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  role: UserRole | null;
  source: string;
  confidence: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_user_id: string | null;
  created_profile_id: string | null;
  error: string | null;
};

const T = {
  border: "border-[color:var(--metal-border-soft,var(--theme-border-soft))]",
  borderStrong: "border-[color:var(--metal-border,var(--theme-surface-page))]",
  glass:
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] bg-[color:var(--theme-surface-inset)] backdrop-blur-md",
  glassStrong:
    "bg-[var(--theme-gradient-panel)] backdrop-blur-md",
  shadow: "shadow-[var(--theme-shadow-medium)]",
  panel: "rounded-2xl border",
  label: "block text-[0.7rem] uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]",
  input:
    "w-full rounded-md border bg-[color:var(--theme-surface-page)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] outline-none transition " +
    "placeholder:text-[color:var(--theme-text-muted)] focus:ring-1 focus:ring-[color:var(--accent-copper-soft,#e7a36c)] " +
    "focus:border-[color:var(--accent-copper,#c56a2f)]",
  chip:
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] " +
    "border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)]",
};

function safeMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

function displayRole(r: string | null): string {
  return r ?? "—";
}

export default function InviteCandidatesList(): JSX.Element {
  const [search, setSearch] = useState<string>("");
  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [passwordById, setPasswordById] = useState<Record<string, string>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const sp: string[] = [];
      if (search.trim()) sp.push(`q=${encodeURIComponent(search.trim())}`);
      if (status.trim()) sp.push(`status=${encodeURIComponent(status.trim())}`);
      const q = sp.length ? `?${sp.join("&")}` : "";

      const res = await fetch(`/api/admin/staff-invite-candidates${q}`);
      if (!res.ok) throw new Error(`Failed to load candidates (${res.status})`);

      const json: { candidates?: CandidateRow[] } = await res.json();
      setRows(json.candidates ?? []);
    } catch (e) {
      setError(safeMsg(e, "Failed to load invite candidates"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createUser(candidateId: string): Promise<void> {
    const password = (passwordById[candidateId] ?? "").trim();
    if (!password) {
      setError("Password is required to create the user.");
      return;
    }

    setActionBusyId(candidateId);
    setError(null);

    try {
      const res = await fetch(`/api/admin/staff-invite-candidates/${candidateId}/create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Create user failed (${res.status})`);
      }

      setPasswordById((prev) => ({ ...prev, [candidateId]: "" }));
      await load();
    } catch (e) {
      setError(safeMsg(e, "Failed to create user"));
    } finally {
      setActionBusyId(null);
    }
  }

  async function resendInvite(candidateId: string): Promise<void> {
    setActionBusyId(candidateId);
    setError(null);

    try {
      const res = await fetch(`/api/admin/staff-invite-candidates/${candidateId}/resend-invite`, {
        method: "POST",
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Resend invite failed (${res.status})`);
      }

      await load();
    } catch (e) {
      setError(safeMsg(e, "Failed to resend invite"));
    } finally {
      setActionBusyId(null);
    }
  }

  const card = useMemo(
    () => [T.panel, T.border, T.glass, T.shadow, "p-4"].join(" "),
    [],
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className={card}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <label className={T.label}>Search</label>
            <input
              className={[T.input, T.border].join(" ")}
              placeholder="Search name, email, phone, or username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-w-[220px]">
            <label className={T.label}>Status</label>
            <select
              className={[T.input, T.border].join(" ")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="pending">Pending</option>
              <option value="invited">Invited</option>
              <option value="created">Created (email failed)</option>
              <option value="error">Error</option>
              <option value="all">All</option>
            </select>
          </div>

          <Button
            type="button"
            variant="default"
            className="font-semibold"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/35 px-3 py-2 text-xs text-red-100">
            {error}
          </div>
        )}
      </div>

      {/* List */}
      <div className={[T.panel, T.border, T.glassStrong, T.shadow].join(" ")}>
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[0.7rem] uppercase tracking-[0.14em] text-[color:var(--theme-text-secondary)]">
          <div className="col-span-3">Candidate</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-2">Username</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <ul className="divide-y divide-[color:var(--metal-border-soft,var(--theme-border-soft))]">
          {rows.map((c) => {
            const busy = actionBusyId === c.id;
            const canCreate = c.status === "pending";
            const canResend = c.status === "invited" || c.status === "created" || c.status === "error";

            return (
              <li
                key={c.id}
                className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm text-[color:var(--theme-text-primary)]"
              >
                <div className="col-span-3 truncate">
                  <div className="font-semibold text-[color:var(--theme-text-primary)]">{c.full_name ?? "—"}</div>
                  <div className="mt-1 text-xs text-[color:var(--theme-text-muted)] font-mono">
                    {c.id.slice(0, 8)} • <span className={T.chip}>{c.status}</span>
                  </div>
                  {c.error && (
                    <div className="mt-1 text-[11px] text-red-300 truncate">{c.error}</div>
                  )}
                </div>

                <div className="col-span-3 truncate text-[color:var(--theme-text-secondary)]">{c.email ?? "—"}</div>

                <div className="col-span-2 truncate text-[color:var(--theme-text-secondary)]">
                  {c.username ? <span className="font-mono">@{c.username}</span> : "—"}
                </div>

                <div className="col-span-2">
                  <span className={T.chip}>{displayRole(c.role)}</span>
                </div>

                <div className="col-span-2 flex flex-col items-end gap-2">
                  {canCreate && (
                    <>
                      <input
                        className={[T.input, T.border, "w-[180px] text-xs"].join(" ")}
                        placeholder="Temp password"
                        type="password"
                        value={passwordById[c.id] ?? ""}
                        onChange={(e) =>
                          setPasswordById((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void createUser(c.id)}
                      >
                        {busy ? "Creating…" : "Create + Invite"}
                      </Button>
                    </>
                  )}

                  {!canCreate && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        disabled={busy || !canResend}
                        onClick={() => void resendInvite(c.id)}
                      >
                        {busy ? "Sending…" : "Resend invite"}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}

          {!loading && rows.length === 0 && (
            <li className="px-4 py-8 text-sm text-[color:var(--theme-text-secondary)]">No candidates found.</li>
          )}

          {loading && (
            <li className="px-4 py-8 text-sm text-[color:var(--theme-text-secondary)]">Loading…</li>
          )}
        </ul>
      </div>
    </div>
  );
}
