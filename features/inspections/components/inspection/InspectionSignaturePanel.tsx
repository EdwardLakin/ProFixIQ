"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

export type SignatureRole = "technician" | "customer" | "advisor";

export type InspectionSignaturePanelProps = {
  inspectionId: string | null | undefined;
  workOrderLineId?: string | null;
  role: SignatureRole;
  defaultName?: string;
  onSigned?: () => void;

  /**
   * Optional: where to send a tech to save their signature (one-time setup).
   * If omitted, we’ll just show a toast message.
   */
  techSettingsHref?: string;

  /**
   * Optional: lock the name field (useful for tech sign-off).
   * Default: true for technician, false otherwise.
   */
  lockNameInput?: boolean;
};

function roleLabel(role: SignatureRole): string {
  if (role === "technician") return "Technician";
  if (role === "customer") return "Customer";
  return "Service advisor";
}

function roleSubtext(role: SignatureRole): string {
  if (role === "technician")
    return "Uses your saved signature (no re-signing every time).";
  if (role === "advisor")
    return "Sign to approve/confirm this inspection snapshot.";
  return "Sign to acknowledge and lock this inspection snapshot.";
}

function confirmText(role: SignatureRole): string {
  if (role === "technician") {
    return "I confirm I performed/reviewed this inspection and the information above is accurate to the best of my knowledge.";
  }
  if (role === "advisor") {
    return "I confirm I have reviewed this inspection and approve it to the best of my knowledge.";
  }
  return "I confirm that I have reviewed this inspection and that the information above is accurate to the best of my knowledge.";
}

type SavedSigResponse = {
  ok?: boolean;
  error?: string;
  signatureImagePath?: string | null;
  signatureHash?: string | null;
};

type ProfileResponse = {
  ok?: boolean;
  error?: string;
  fullName?: string | null;
  full_name?: string | null;
  firstName?: string | null;
  first_name?: string | null;
  lastName?: string | null;
  last_name?: string | null;
  name?: string | null;
};

function pickNameFromProfile(json: ProfileResponse | null): string | null {
  if (!json) return null;
  const firstName = json.firstName ?? json.first_name;
  const lastName = json.lastName ?? json.last_name;
  const candidates = [
    json.fullName,
    json.full_name,
    json.name,
    [firstName, lastName].filter(Boolean).join(" "),
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  return candidates[0] ?? null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return UUID_RE.test(normalized) ? normalized : null;
}

const InspectionSignaturePanel: React.FC<InspectionSignaturePanelProps> = ({
  inspectionId,
  workOrderLineId,
  role,
  defaultName,
  onSigned,
  techSettingsHref,
  lockNameInput,
}) => {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const searchParams = useSearchParams();
  const defaultLock = role === "technician";
  const [autoFilledName, setAutoFilledName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const shouldLockFromProps =
    typeof lockNameInput === "boolean" ? lockNameInput : defaultLock;
  const nameLocked =
    shouldLockFromProps && role === "technician" && !!autoFilledName;

  const [name, setName] = useState(defaultName ?? "");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingName, setLoadingName] = useState(
    role === "technician" && !(defaultName ?? "").trim(),
  );

  const resolvedWorkOrderLineId = useMemo(() => {
    const fromProps = validUuid(workOrderLineId);
    if (fromProps) return fromProps;

    const fromUrl = validUuid(searchParams.get("workOrderLineId"));
    if (fromUrl) return fromUrl;

    if (typeof window === "undefined") return null;
    try {
      const raw = window.sessionStorage.getItem("inspection:params");
      if (!raw) return null;
      const staged = JSON.parse(raw) as Record<string, unknown>;
      return validUuid(staged.workOrderLineId);
    } catch {
      return null;
    }
  }, [searchParams, workOrderLineId]);

  // Keep name in sync if parent provides a default later.
  useEffect(() => {
    const normalized = (defaultName ?? "").trim();
    if (!normalized) return;
    setName((previous) => (previous.trim().length ? previous : normalized));
    if (role === "technician") {
      setAutoFilledName((previous) => previous ?? normalized);
      setLoadingName(false);
    }
  }, [defaultName, role]);

  async function fetchSavedTechSignature(): Promise<{
    signatureImagePath: string;
    signatureHash: string | null;
  } | null> {
    try {
      const response = await fetch("/api/profile/signature", {
        method: "GET",
        credentials: "include",
        headers: { "Cache-Control": "no-store" },
      });

      const json = (await response
        .json()
        .catch(() => null)) as SavedSigResponse | null;

      if (!response.ok || json?.error) {
        throw new Error(json?.error || "Failed to load saved signature");
      }

      const path = json?.signatureImagePath ?? null;
      if (!path) return null;

      return {
        signatureImagePath: path,
        signatureHash: json?.signatureHash ?? null,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load saved signature";
      toast.error(message);
      return null;
    }
  }

  // Tech convenience: auto-fill name from profile if missing.
  useEffect(() => {
    if (role !== "technician") {
      setLoadingName(false);
      return;
    }
    if (name.trim().length > 0) {
      setLoadingName(false);
      return;
    }

    let cancelled = false;
    setLoadingName(true);

    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("full_name, first_name, last_name")
          .eq("id", user.id)
          .maybeSingle<ProfileResponse>();
        if (error) return;

        const profileName = pickNameFromProfile(data ?? null);
        if (!profileName) return;

        if (!cancelled) {
          setName(profileName);
          setAutoFilledName(profileName);
        }
      } catch {
        // Name autofill is a convenience; the technician can type a fallback.
      } finally {
        if (!cancelled) setLoadingName(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [role, name, supabase]);

  const header = useMemo(() => `${roleLabel(role)} Signature`, [role]);

  const handleSign = async (): Promise<void> => {
    const normalizedInspectionId = validUuid(inspectionId);
    if (!normalizedInspectionId && !resolvedWorkOrderLineId) {
      toast.error("Inspection context is missing – save or reopen the inspection.");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter your full name.");
      return;
    }
    if (!confirm) {
      toast.error("Please confirm before signing.");
      return;
    }

    if (busy) return;
    setBusy(true);

    try {
      let signatureImagePath: string | null = null;
      let signatureHash: string | null = null;

      if (role === "technician") {
        const saved = await fetchSavedTechSignature();
        if (!saved?.signatureImagePath) {
          if (techSettingsHref) {
            toast.error(
              "No saved tech signature. Please add one in Tech Settings.",
            );
          } else {
            toast.error("No saved tech signature. Add one in Tech Settings.");
          }
          return;
        }
        signatureImagePath = saved.signatureImagePath;
        signatureHash = saved.signatureHash;
      }

      const response = await fetch("/api/inspections/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          inspectionId: normalizedInspectionId,
          workOrderLineId: resolvedWorkOrderLineId,
          role,
          signedName: name.trim(),
          signatureImagePath,
          signatureHash,
        }),
      });

      const json = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok || json?.error) {
        throw new Error(json?.error || "Signature failed");
      }

      toast.success(`${roleLabel(role)} signature captured.`);
      onSigned?.();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("sign error", error);
      toast.error(
        error instanceof Error ? error.message : "Unable to save signature.",
      );
    } finally {
      setBusy(false);
    }
  };

  const canResolveInspection =
    Boolean(validUuid(inspectionId)) || Boolean(resolvedWorkOrderLineId);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-4 text-xs text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-soft)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            {header}
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--theme-text-secondary)]">
            {roleSubtext(role)}
          </div>
        </div>
      </div>

      <label
        className="mt-1 text-[11px] font-medium text-[color:var(--theme-text-secondary)]"
        onClick={() => {
          if (!nameLocked) nameInputRef.current?.focus();
        }}
      >
        Full name
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={nameLocked}
          className={[
            "mt-1 h-10 w-full rounded-lg border px-3 py-2 text-sm outline-none transition",
            nameLocked
              ? "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]"
              : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-primary)] focus:border-[color:var(--brand-primary)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-primary)_24%,transparent)]",
          ].join(" ")}
          placeholder={
            role === "technician" && loadingName
              ? "Loading your name…"
              : "Type your full legal name"
          }
        />
        {role === "technician" && nameLocked ? (
          <div className="mt-1.5 text-[10px] text-[color:var(--theme-text-secondary)]">
            Tech name is pulled from your profile (edit in your account settings
            if needed).
          </div>
        ) : null}
      </label>

      <label className="flex items-start gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-[11px] text-[color:var(--theme-text-secondary)]">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(event) => setConfirm(event.target.checked)}
          className="mt-[1px] h-3.5 w-3.5 rounded border border-[color:var(--theme-border-strong)] bg-[color:var(--theme-surface-page)] text-[color:var(--brand-primary)]"
        />
        <span>{confirmText(role)}</span>
      </label>

      {!canResolveInspection && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/35 dark:text-amber-200">
          This inspection has not been anchored to a work-order line yet. Save
          or reopen it before signing.
        </p>
      )}

      {role === "technician" ? (
        <p className="text-[11px] text-[color:var(--theme-text-secondary)]">
          If signing fails, it usually means no saved signature exists yet.
          {techSettingsHref ? (
            <>
              {" "}
              Add one in{" "}
              <span className="font-medium text-[color:var(--theme-text-primary)]">
                Tech Settings
              </span>
              .
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={handleSign}
          disabled={busy || loadingName || !canResolveInspection}
          className="inline-flex items-center rounded-lg border border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Signing…" : "Sign"}
        </button>
      </div>
    </div>
  );
};

export default InspectionSignaturePanel;
